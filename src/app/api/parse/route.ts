import { NextResponse } from "next/server";
import { getLicense, bindDevice } from "@/lib/db";

// 匹配小红书短链或长链的正则表达式（优化：避免匹配到中文或全角标点符号）
const urlRegex = /(https?:\/\/(?:www\.)?(?:xhslink\.com|xiaohongshu\.com)[a-zA-Z0-9_/%?=&.-]+)/i;
 
// 匹配小红书图片域名的正则表达式
const imgDomainRegex = /https?:\/\/[^\s"'\\]*\.xhscdn\.com[^\s"'\\]*/ig;
 
interface ParseResponse {
  success: boolean;
  images?: string[];
  title?: string;
  desc?: string;
  videoUrl?: string;
  error?: string;
}
 
function cleanImageUrls(urls: string[]): string[] {
  const cleanImages = urls.map(u => {
    // 恢复转义字符 \u002F -> /
    let cleanUrl = u.replace(/\\u002F/g, '/');
    // 去除可能存在的转义引号等
    cleanUrl = cleanUrl.replace(/\\"/g, '');
    // 去掉问号后的参数
    cleanUrl = cleanUrl.split("?")[0];
 
    // 提取形如 1040g... 的 fileId，通常在最后一个 / 之后，! 之前
    const parts = cleanUrl.split('/');
    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      const fileId = lastPart.split('!')[0];
      // 如果是小红书图片域名，则将其转换为原图域名
      if (fileId && cleanUrl.includes('xhscdn.com')) {
        return `https://sns-img-qc.xhscdn.com/${fileId}`;
      }
    }
 
    return cleanUrl;
  });
 
  // 去重并过滤掉带有 avatar 字样的链接
  return Array.from(new Set(cleanImages)).filter(u => !u.includes('avatar') && u.includes('xhscdn.com'));
}
 
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, licenseKey, deviceId } = body;

    // --- 授权与防倒卖校验 ---
    if (!licenseKey || !deviceId) {
      return NextResponse.json({ success: false, error: "未提供卡密或设备信息不完整" }, { status: 401 });
    }

    const license = await getLicense(licenseKey);
    if (!license) {
      return NextResponse.json({ success: false, error: "卡密不存在或输入错误" }, { status: 401 });
    }

    // 检查卡密是否过期
    if (Date.now() > license.expiresAt) {
      return NextResponse.json({ success: false, error: "该卡密已过期，请续费后使用" }, { status: 401 });
    }

    // 一机一码：设备指纹绑定与校验
    if (!license.deviceId) {
      // 如果该卡密是首次使用，自动与当前设备指纹绑定
      const success = await bindDevice(licenseKey, deviceId);
      if (!success) {
        return NextResponse.json({ success: false, error: "设备绑定失败，请联系管理员" }, { status: 500 });
      }
    } else if (license.deviceId !== deviceId) {
      // 如果卡密已被绑定，且访问的设备不是绑定的那台设备，果断拦截
      return NextResponse.json({ success: false, error: "禁止转卖或共享！该卡密已绑定至其他设备，拒绝访问。" }, { status: 403 });
    }
    // --- 授权校验结束 ---

    if (!url) {
      return NextResponse.json({ success: false, error: "请输入链接" }, { status: 400 });
    }
 
    // 1. 如果用户直接输入了图片直链 (例如 sns-webpic-qc.xhscdn.com/...)
    if (url.includes(".xhscdn.com")) {
      const match = url.match(imgDomainRegex);
      if (match && match.length > 0) {
        const uniqueImages = cleanImageUrls(match);
        return NextResponse.json({ success: true, images: uniqueImages });
      }
    }
 
    // 2. 提取分享文本中的小红书链接
    const linkMatch = url.match(urlRegex);
    if (!linkMatch) {
      return NextResponse.json({ success: false, error: "未识别到有效的小红书链接" }, { status: 400 });
    }
 
    const shareUrl = linkMatch[1];
 
    // 3. 请求该页面，使用特定的 User-Agent 模拟手机浏览器（有些短链在桌面端可能重定向到不同页面，但在小红书我们先用桌面端尝试）
    const response = await fetch(shareUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });
 
    if (!response.ok) {
      return NextResponse.json({ success: false, error: "无法访问该链接，请确认链接是否有效" }, { status: 400 });
    }
 
    const html = await response.text();
 
    let rawImages: string[] = [];
    let title = "";
    let desc = "";
    let videoUrl = "";
 
    // 4. 尝试从 window.__INITIAL_STATE__ 中提取
    const stateMatch = html.match(/window\.__INITIAL_STATE__=(.*?)<\/script>/);
    if (stateMatch && stateMatch[1]) {
      const stateStr = stateMatch[1];
      // 提取标题和描述文案
      try {
        // 由于 JSON 可能包含 undefined，先替换为 null
        const cleanStateStr = stateStr.replace(/undefined/g, 'null');
        const stateJson = JSON.parse(cleanStateStr);
        // 小红书的数据结构通常是 note.noteDetailMap[noteId].note
        const noteId = stateJson?.note?.firstNoteId;
        if (noteId && stateJson?.note?.noteDetailMap?.[noteId]?.note) {
          const noteObj = stateJson.note.noteDetailMap[noteId].note;
          title = noteObj.title || "";
          desc = noteObj.desc || "";
          // 尝试提取视频链接 (无水印的 h264 或 h265 格式)
          if (noteObj.type === 'video' && noteObj.video?.media?.stream) {
            const stream = noteObj.video.media.stream;
            // 优先取 h264，如果没有再看有没有其他格式
            if (stream.h264 && stream.h264.length > 0) {
              videoUrl = stream.h264[0].masterUrl;
            } else if (stream.h265 && stream.h265.length > 0) {
              videoUrl = stream.h265[0].masterUrl;
            }
          }
          
          // 新增：直接从 JSON 中提取 imageList，这是最准确的图文提取方式
          if (noteObj.imageList && Array.isArray(noteObj.imageList)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            noteObj.imageList.forEach((img: any) => {
              const url = img.urlDefault || (img.infoList && img.infoList[0]?.url);
              if (url) {
                // 如果没有协议头，补全
                const fullUrl = url.startsWith('//') ? `https:${url}` : url;
                rawImages.push(fullUrl);
              }
            });
          }
        }
      } catch (err) {
        console.error("解析 JSON 提取文案/视频失败:", err);
        // 如果 JSON 解析失败，降级使用正则提取文案
        const titleMatch = stateStr.match(/"title":"([^"\\]*(?:\\.[^"\\]*)*)"/);
        if (titleMatch) title = titleMatch[1];
        const descMatch = stateStr.match(/"desc":"([^"\\]*(?:\\.[^"\\]*)*)"/);
        if (descMatch) desc = descMatch[1];
        // 尝试用正则提取视频链接
        const videoMatch = stateStr.match(/"masterUrl":"(https?:\/\/[^"]*\.mp4[^"]*)"/);
        if (videoMatch) {
          videoUrl = videoMatch[1].replace(/\\u002F/g, '/');
        }
      }
      // 强制将视频链接转换为 https，避免浏览器因混合内容（Mixed Content）阻止下载
      if (videoUrl && videoUrl.startsWith('http://')) {
        videoUrl = videoUrl.replace('http://', 'https://');
      }
 
      // 处理转义字符
      if (title) title = title.replace(/\\n/g, '\n').replace(/\\"/g, '"');
      if (desc) desc = desc.replace(/\\n/g, '\n').replace(/\\"/g, '"');
 
      // 正则匹配所有带有 sns-webpic 的链接（排除头像 avatar 等）
      // 处理类似 "urlDefault":"https://sns-webpic-qc.xhscdn.com/..." 或者 http
      const urlRegexState = /"urlDefault":"(https?:\\u002F\\u002F[^"]*sns-webpic[^"]*\.xhscdn\.com[^"]*)"/gi;
      let imgMatch;
      while ((imgMatch = urlRegexState.exec(stateStr)) !== null) {
        rawImages.push(imgMatch[1]);
      }
      // 也匹配没有被转义的 \u002F 的情况
      const urlRegexStateNormal = /"urlDefault":"(https?:\/\/[^"]*sns-webpic[^"]*\.xhscdn\.com[^"]*)"/gi;
      while ((imgMatch = urlRegexStateNormal.exec(stateStr)) !== null) {
        rawImages.push(imgMatch[1]);
      }
      
      // 补充：小红书有些新版图片使用的是 sns-img 域名，需要一并提取
      const urlRegexStateImg = /"urlDefault":"(https?:(?:\\u002F\\u002F|\/\/)[^"]*sns-img[^"]*\.xhscdn\.com[^"]*)"/gi;
      while ((imgMatch = urlRegexStateImg.exec(stateStr)) !== null) {
        rawImages.push(imgMatch[1]);
      }
    }
 
    // 5. 如果仍然没有找到，退而求其次，正则提取 HTML 中的所有的图片
    if (rawImages.length === 0) {
      const allImagesMatch = html.match(/https?:\/\/[^"'\s<>]*(?:sns-webpic|sns-img)[^"'\s<>]*\.xhscdn\.com[^"'\s<>]*/g);
      if (allImagesMatch) {
        rawImages = allImagesMatch;
      }
    }
 
    // 6. 核心逻辑：去除 ? 后的参数并转换域名（去水印）
    // 过滤掉小红书视频的默认封面图，避免在前端显示裂图或无关图片
    const filteredImages = rawImages.filter((img) => 
      !img.includes('sns-video-') && 
      !img.includes('video')
    );
    const uniqueImages = cleanImageUrls(filteredImages);
 
    if (uniqueImages.length === 0 && !title && !desc && !videoUrl) {
      return NextResponse.json({ success: false, error: "未能在该链接中提取到内容，请检查链接是否正确或权限受限" }, { status: 400 });
    }
 
    return NextResponse.json({ success: true, images: uniqueImages, title, desc, videoUrl });
  } catch (error) {
    console.error("Parse API Error:", error);
    return NextResponse.json({ success: false, error: "服务端解析失败，请稍后重试" }, { status: 500 });
  }
}
