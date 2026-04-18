"use client";
 
import { useState, useEffect } from "react";
import { Download, Link as LinkIcon, Loader2, Check, CheckSquare, Square, FileText, Copy, Video, Key } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
 
export default function Home() {
const [url, setUrl] = useState("");
const [loading, setLoading] = useState(false);
const [error, setError] = useState("");
const [images, setImages] = useState<string[]>([]);
const [noteTitle, setNoteTitle] = useState("");
const [noteDesc, setNoteDesc] = useState("");
const [videoUrl, setVideoUrl] = useState("");
// 多选状态
const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set());
const [isDownloadingZip, setIsDownloadingZip] = useState(false);
const [downloadProgress, setDownloadProgress] = useState(0);
const [copiedText, setCopiedText] = useState(false);

// 授权与设备绑定状态
const [licenseKey, setLicenseKey] = useState("");
const [deviceId, setDeviceId] = useState("");

// 初始化时获取或生成设备指纹，并从本地读取上次使用的卡密
useEffect(() => {
  let storedDeviceId = localStorage.getItem("device_fingerprint");
  if (!storedDeviceId) {
    // 使用浏览器原生的 crypto.randomUUID 生成唯一的设备标识，并永久保存在 localStorage 中
    storedDeviceId = crypto.randomUUID ? crypto.randomUUID() : 'device-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("device_fingerprint", storedDeviceId);
  }
  setDeviceId(storedDeviceId);

  const storedLicense = localStorage.getItem("saved_license_key");
  if (storedLicense) {
    setLicenseKey(storedLicense);
  }
}, []);

const handleParse = async () => {
if (!licenseKey.trim()) {
  setError("为了保护您的权益，请输入授权卡密");
  return;
}
if (!url.trim()) {
setError("请输入有效的小红书分享链接或图片链接");
return;
}
 
// 保存卡密，方便下次访问不用重新输入
localStorage.setItem("saved_license_key", licenseKey.trim());

setLoading(true);
setError("");
setImages([]);
setNoteTitle("");
setNoteDesc("");
setVideoUrl("");
setSelectedImages(new Set()); // 重置选择
setDownloadProgress(0);
 
try {
const response = await fetch("/api/parse", {
method: "POST",
headers: {
"Content-Type": "application/json",
},
body: JSON.stringify({ url, licenseKey: licenseKey.trim(), deviceId }),
});
 
const data = await response.json();
 
if (!response.ok || !data.success) {
throw new Error(data.error || "解析失败");
}
 
setImages(data.images || []);
setNoteTitle(data.title || "");
setNoteDesc(data.desc || "");
setVideoUrl(data.videoUrl || "");
} catch (err) {
setError(err instanceof Error ? err.message : "解析失败，请检查链接是否正确或稍后重试");
} finally {
setLoading(false);
}
};
 
const handleCopyText = async () => {
const fullText = `${noteTitle ? noteTitle + '\n\n' : ''}${noteDesc}`;
try {
// 检查环境是否允许使用 Clipboard API
const isClipboardSupported = navigator.clipboard && window.isSecureContext;
if (isClipboardSupported) {
try {
await navigator.clipboard.writeText(fullText);
setCopiedText(true);
setTimeout(() => setCopiedText(false), 2000);
return; // 如果成功，直接返回
} catch (clipboardError) {
console.warn("Clipboard API 失败，尝试降级方案", clipboardError);
// 继续执行降级方案
}
}
// 终极降级方案：使用 execCommand
const textArea = document.createElement("textarea");
textArea.value = fullText;
// 避免键盘弹起和页面滚动，且必须在 DOM 树内
textArea.setAttribute("readonly", "");
textArea.style.position = "absolute";
textArea.style.left = "-9999px";
document.body.appendChild(textArea);
textArea.select();
textArea.setSelectionRange(0, 99999); // 兼容移动端 Safari
const successful = document.execCommand('copy');
document.body.removeChild(textArea);
if (successful) {
setCopiedText(true);
setTimeout(() => setCopiedText(false), 2000);
} else {
throw new Error("Fallback copy command failed");
}
} catch (err) {
console.error("所有复制方案均失败", err);
alert("因当前浏览器预览环境的安全沙盒限制，无法直接操作剪贴板。\n\n请您手动全选下方的文案进行复制，或将应用在真实的浏览器（如 Chrome/Edge）新标签页中打开即可正常使用一键复制。");
}
};
 
const handleVideoDownload = async () => {
if (!videoUrl) return;
const btn = document.getElementById('video-download-btn');
if (btn) {
const originalText = btn.innerHTML;
btn.innerHTML = '正在下载...';
btn.setAttribute('disabled', 'true');
try {
// 小红书视频源带有 CORS 放行头，因此可以直接在前端拉取二进制数据，彻底绕过代理服务器的超时限制
// 且必须确保是 https 协议，否则会被浏览器混合内容策略拦截
const secureUrl = videoUrl.replace('http://', 'https://');
const res = await fetch(secureUrl);
if (!res.ok) throw new Error("获取视频数据失败");
const blob = await res.blob();
const blobUrl = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = blobUrl;
link.download = `xhs_video_${Date.now()}.mp4`;
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
} catch (err) {
console.error("前端下载视频失败", err);
// 终极降级：在新标签页打开（因协议已强制 https，新标签页的三点下载菜单也会恢复正常）
alert("视频文件较大，将为您在新标签页中打开。\n\n👉 请在弹出的视频页面中：\n1. 点击画面右下角的【三个点 ⋮】\n2. 选择【下载】即可保存到本地！");
window.open(videoUrl.replace('http://', 'https://'), "_blank");
} finally {
btn.innerHTML = originalText;
btn.removeAttribute('disabled');
}
}
};
 
const handleDownload = async (imageUrl: string, index: number) => {
try {
// 使用后端代理下载避免 CORS 问题
const downloadUrl = `/api/download?url=${encodeURIComponent(imageUrl)}`;
const res = await fetch(downloadUrl);
if (!res.ok) throw new Error("下载请求失败");
const blob = await res.blob();
const blobUrl = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = blobUrl;
link.download = `xhs_image_${index + 1}.jpg`;
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
URL.revokeObjectURL(blobUrl);
} catch (err) {
console.error("下载失败", err);
// 如果下载代理失败，降级在新标签页打开
window.open(imageUrl, "_blank");
}
};
 
const toggleSelect = (index: number) => {
const newSelected = new Set(selectedImages);
if (newSelected.has(index)) {
newSelected.delete(index);
} else {
newSelected.add(index);
}
setSelectedImages(newSelected);
};
 
const selectAll = () => {
if (selectedImages.size === images.length) {
setSelectedImages(new Set());
} else {
setSelectedImages(new Set(images.map((_, i) => i)));
}
};
 
const handleBatchDownload = async () => {
if (selectedImages.size === 0) {
alert("请先选择要下载的图片");
return;
}
 
setIsDownloadingZip(true);
setDownloadProgress(0);
 
try {
const zip = new JSZip();
const folder = zip.folder("小红书无水印原图");
let count = 0;
const total = selectedImages.size;
const selectedIndices = Array.from(selectedImages).sort((a, b) => a - b);
 
for (const index of selectedIndices) {
const imageUrl = images[index];
const downloadUrl = `/api/download?url=${encodeURIComponent(imageUrl)}`;
try {
const res = await fetch(downloadUrl);
if (!res.ok) throw new Error(`获取图片失败: ${index}`);
const blob = await res.blob();
folder?.file(`xhs_image_${index + 1}.jpg`, blob);
count++;
setDownloadProgress(Math.round((count / total) * 100));
} catch (err) {
console.error(`下载第 ${index + 1} 张图片时出错:`, err);
}
}
 
if (count > 0) {
setDownloadProgress(100);
const content = await zip.generateAsync({ type: "blob" });
saveAs(content, `小红书无水印原图_${Date.now()}.zip`);
} else {
alert("下载失败，请检查网络或重试");
}
} catch (err) {
console.error("打包下载失败", err);
alert("打包下载失败");
} finally {
setIsDownloadingZip(false);
setTimeout(() => setDownloadProgress(0), 1000);
}
};
 
return (
<main className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-[#ff2442] selection:text-white">
{/* Header */}
<header className="w-full py-6 px-6 sm:px-12 flex items-center justify-between bg-white border-b border-zinc-100">
<div className="flex items-center gap-2">
{/* eslint-disable-next-line @next/next/no-img-element */}
<img src="/logo.svg" alt="Logo" className="w-8 h-8 object-contain shadow-sm" />
<h1 className="text-xl font-bold tracking-tight">红图去水印</h1>
</div>
<nav>
<a
href="https://github.com"
target="_blank"
rel="noopener noreferrer"
className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
>
关于
</a>
</nav>
</header>
 
<div className="max-w-4xl mx-auto px-6 py-16 sm:py-24">
{/* Hero Section */}
<div className="text-center mb-12 sm:mb-16">
<h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-zinc-900 mb-4 sm:mb-6">
获取高质量的无水印原图
</h2>
<p className="text-base sm:text-lg text-zinc-500 mb-8 sm:mb-10 max-w-2xl mx-auto px-4 sm:px-0">
粘贴小红书笔记的分享链接，一键提取并去除所有图片和视频水印。支持批量预览、提取文案和高清下载。
</p>
 
{/* Input Area */}
<div className="max-w-2xl mx-auto relative group">
<div className="absolute inset-0 bg-[#ff2442]/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

{/* License Key Input */}
<div className="relative flex flex-col items-center bg-white rounded-t-2xl p-2 border-x border-t border-zinc-100 border-b-zinc-50 transition-all z-10">
  <div className="flex items-center pl-4 pr-2 py-3 sm:py-2 w-full">
    <Key className="w-5 h-5 text-zinc-400 shrink-0" />
    <input
      type="password"
      value={licenseKey}
      onChange={(e) => setLicenseKey(e.target.value)}
      placeholder="在此输入您的授权卡密 (VIP-MONTH-8888)..."
      className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-zinc-800 placeholder:text-zinc-400 px-4 text-base font-mono tracking-wide"
    />
  </div>
</div>

{/* URL Input */}
<div className="relative flex flex-col sm:flex-row items-center bg-white rounded-b-2xl p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-zinc-100 focus-within:border-[#ff2442]/30 focus-within:ring-4 focus-within:ring-[#ff2442]/10 transition-all z-20 -mt-[1px]">
<div className="flex items-center pl-4 pr-2 py-3 sm:py-0 w-full">
<LinkIcon className="w-5 h-5 text-[#ff2442] shrink-0" />
<input
type="text"
value={url}
onChange={(e) => {
const val = e.target.value;
// 尝试自动从粘贴的长文本中提取链接
const match = val.match(/(https?:\/\/(?:www\.)?(?:xhslink\.com|xiaohongshu\.com)[a-zA-Z0-9_/%?=&.-]+)/i);
if (match && val.length > match[1].length + 5) {
setUrl(match[1]); // 如果找到了链接并且原文本包含较多其他杂字，则自动净化为纯链接
} else {
setUrl(val);
}
}}
onKeyDown={(e) => e.key === "Enter" && handleParse()}
placeholder="在此粘贴小红书分享链接..."
className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-zinc-800 placeholder:text-zinc-400 px-4 text-base"
/>
</div>
<button
onClick={handleParse}
disabled={loading}
className="w-full sm:w-auto mt-2 sm:mt-0 whitespace-nowrap bg-[#ff2442] hover:bg-[#e61b36] text-white px-8 py-3.5 rounded-xl font-medium transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2 shadow-sm"
>
{loading ? (
<>
<Loader2 className="w-5 h-5 animate-spin" />
解析中...
</>
) : (
"一键解析"
)}
</button>
</div>
</div>
{error && (
<div className="mt-6 text-[#ff2442] text-sm bg-[#ff2442]/5 inline-block px-4 py-2 rounded-lg font-medium">
{error}
</div>
)}
</div>
 
{/* Results Area */}
{(images.length > 0 || noteTitle || noteDesc || videoUrl) && (
<div className="animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out">
{/* Video Section */}
{videoUrl && (
<div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100 mb-8">
<div className="flex items-center justify-between mb-4">
<h3 className="text-lg font-bold flex items-center gap-2 text-zinc-800">
<Video className="w-5 h-5 text-[#ff2442]" />
无水印视频
</h3>
<button
id="video-download-btn"
onClick={handleVideoDownload}
className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-[#ff2442] hover:bg-[#e61b36] text-white disabled:opacity-70 disabled:hover:bg-[#ff2442] transition-colors shadow-sm"
>
<Download className="w-4 h-4" />
下载视频
</button>
</div>
<div className="aspect-video w-full max-w-2xl mx-auto rounded-xl overflow-hidden bg-black flex items-center justify-center">
<video 
src={videoUrl}
controls
className="w-full h-full object-contain"
/>
</div>
</div>
)}
 
{/* Note Content Section */}
{(noteTitle || noteDesc) && (
<div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100 mb-8">
<div className="flex items-center justify-between mb-4">
<h3 className="text-lg font-bold flex items-center gap-2 text-zinc-800">
<FileText className="w-5 h-5 text-[#ff2442]" />
笔记文案
</h3>
<button
onClick={handleCopyText}
className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-50 hover:bg-zinc-100 text-zinc-700 transition-colors"
>
{copiedText ? (
<><Check className="w-3.5 h-3.5 text-green-600" /> 已复制</>
) : (
<><Copy className="w-3.5 h-3.5" /> 一键复制文案</>
)}
</button>
</div>
<div className="bg-zinc-50 rounded-xl p-4 max-h-60 overflow-y-auto text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">
{noteTitle && <div className="font-bold text-zinc-800 text-base mb-2">{noteTitle}</div>}
{noteDesc}
</div>
</div>
)}
 
{/* Images Results Section */}
{images.length > 0 && (
<div className="mt-8">
<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
<h3 className="text-xl font-bold flex items-center gap-2">
解析结果 <span className="text-sm font-normal text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">{images.length} 张</span>
</h3>
<div className="flex flex-col w-full sm:flex-row items-center gap-3 sm:w-auto">
<button
onClick={selectAll}
className="w-full sm:w-auto flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-colors"
>
{selectedImages.size === images.length ? (
<><CheckSquare className="w-4 h-4" /> 取消全选</>
) : (
<><Square className="w-4 h-4" /> 全选</>
)}
</button>
<button
onClick={handleBatchDownload}
disabled={isDownloadingZip || selectedImages.size === 0}
className="w-full sm:w-auto flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-xl text-sm font-medium bg-[#ff2442] hover:bg-[#e61b36] text-white disabled:opacity-50 disabled:hover:bg-[#ff2442] transition-colors shadow-sm"
>
{isDownloadingZip ? (
<>
<Loader2 className="w-4 h-4 animate-spin" />
打包中 {downloadProgress}%
</>
) : (
<>
<Download className="w-4 h-4" />
一键下载 ({selectedImages.size})
</>
)}
</button>
</div>
</div>
<div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
{images.map((img, index) => (
<div 
key={index} 
className={`group relative bg-white rounded-2xl overflow-hidden shadow-sm border transition-all duration-300 cursor-pointer ${
selectedImages.has(index) ? 'border-[#ff2442] ring-2 ring-[#ff2442]/20' : 'border-zinc-100 hover:shadow-xl hover:border-zinc-300'
}`}
onClick={() => toggleSelect(index)}
>
{/* Selection Checkbox */}
<div className="absolute top-3 left-3 z-10">
<div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${
selectedImages.has(index) 
? 'bg-[#ff2442] border-[#ff2442] text-white' 
: 'bg-white/80 border-white/50 text-transparent group-hover:border-white shadow-sm'
}`}>
<Check className="w-3.5 h-3.5" strokeWidth={3} />
</div>
</div>
 
<div className="aspect-[3/4] w-full relative bg-zinc-100">
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
src={`/api/download?url=${encodeURIComponent(img)}`}
alt={`Parsed image ${index + 1}`}
className="object-cover w-full h-full"
/>
{/* Action Overlay */}
<div className="absolute inset-0 bg-black/20 sm:bg-black/40 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 sm:p-4 gap-2" onClick={(e) => e.stopPropagation()}>
<button
onClick={(e) => {
e.stopPropagation();
handleDownload(img, index);
}}
className="w-full bg-[#ff2442] hover:bg-[#e61b36] text-white px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 translate-y-0 sm:translate-y-4 sm:group-hover:translate-y-0 duration-300"
>
<Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
<span className="sm:inline">下载</span><span className="hidden sm:inline">高清原图</span>
</button>
</div>
</div>
</div>
))}
</div>
</div>
)}
</div>
)}
</div>
</main>
);
}