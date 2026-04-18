import { NextResponse } from "next/server";

const AVAILABLE_MODELS = [
  {
    id: "default",
    name: "Default",
    description: "Default model via SDK",
    multimodal: false,
  },
  {
    id: "glm-4",
    name: "GLM-4",
    description: "\u667e\u8c31GLM-4 \u9ad8\u6027\u80fd\u6587\u672c\u6a21\u578b",
    multimodal: false,
  },
  {
    id: "glm-4v",
    name: "GLM-4V",
    description: "\u667e\u8c31GLM-4V \u539f\u751f\u591a\u6a21\u6001\u6a21\u578b\uff08\u652f\u6301\u56fe\u50cf\u7406\u89e3\uff09",
    multimodal: true,
  },
];

export async function GET() {
  return NextResponse.json({ models: AVAILABLE_MODELS });
}
