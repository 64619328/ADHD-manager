import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { createProgress, normalizeText } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: idValue } = await context.params;
    const id = parseId(idValue);

    if (!id) {
      return NextResponse.json({ error: "任务 ID 无效" }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
    const content = normalizeText(body?.content);

    if (!content) {
      return NextResponse.json({ error: "进度记录不能为空" }, { status: 400 });
    }

    const task = await createProgress(id, content);
    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
