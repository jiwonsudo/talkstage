import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 폰에서 LAN 주소(예: http://192.168.0.5:5180)로 개발 서버에 붙을 수 있게 해요.
  // 막히면 JS 가 안 돌아서 화면이 반쯤 깨져 보여요. 개발 모드에서만 쓰여요.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*', '*.local'],
};

export default nextConfig;
