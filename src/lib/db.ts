import fs from 'fs';
import path from 'path';
import { kv } from '@vercel/kv';

const DB_FILE_PATH = path.join(process.cwd(), 'data', 'licenses.json');

export interface LicenseData {
  deviceId: string | null;  // 绑定的设备指纹 UUID
  expiresAt: number;        // 卡密过期时间戳
  note: string;             // 卡密备注
}

export interface LicenseDB {
  [key: string]: LicenseData;
}

// 智能探测：如果配置了 Vercel KV 的环境变量，则自动切换为云端 Redis 数据库
const isKVEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// === 以下为本地 JSON 文件数据库的备用逻辑 ===
function initLocalDb() {
  const dir = path.dirname(DB_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  if (!fs.existsSync(DB_FILE_PATH)) {
    const initialData: LicenseDB = {
      "VIP-MONTH-8888": {
        deviceId: null,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        note: "月卡测试"
      },
      "VIP-YEAR-9999": {
        deviceId: null,
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        note: "年卡测试"
      },
      "VIP-TEST-0000": {
        deviceId: null,
        expiresAt: Date.now() - 1000,
        note: "过期测试"
      }
    };
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

function readLocalDb(): LicenseDB {
  initLocalDb();
  try {
    const data = fs.readFileSync(DB_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error("读取本地数据库失败:", error);
    return {};
  }
}

function writeLocalDb(data: LicenseDB) {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error("写入本地数据库失败:", error);
  }
}
// === 本地逻辑结束 ===


// 异步获取卡密信息（支持云端 KV 与本地 JSON 双轨）
export async function getLicense(key: string): Promise<LicenseData | null> {
  if (isKVEnabled) {
    try {
      // 在 Redis 中，我们以 "license:卡密" 作为 key
      const data = await kv.get<LicenseData>(`license:${key}`);
      return data || null;
    } catch (error) {
      console.error("Vercel KV 获取卡密失败:", error);
      return null;
    }
  } else {
    // 降级使用本地 JSON 数据库
    const db = readLocalDb();
    return db[key] || null;
  }
}

// 异步绑定设备指纹
export async function bindDevice(key: string, deviceId: string): Promise<boolean> {
  if (isKVEnabled) {
    try {
      const data = await kv.get<LicenseData>(`license:${key}`);
      if (data) {
        data.deviceId = deviceId;
        // 更新 Redis 里的数据
        await kv.set(`license:${key}`, data);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Vercel KV 绑定设备失败:", error);
      return false;
    }
  } else {
    // 降级使用本地 JSON 数据库
    const db = readLocalDb();
    if (db[key]) {
      db[key].deviceId = deviceId;
      writeLocalDb(db);
      return true;
    }
    return false;
  }
}
