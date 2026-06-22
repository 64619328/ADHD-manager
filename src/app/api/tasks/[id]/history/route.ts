import { NextResponse } from "next/server";
import { getHistory, getTask } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id: idValue } = await context.params;
  const id = parseId(idValue);

  if (!id) {
    return NextResponse.json({ error: "任务 ID 无效" }, { status: 400 });
  }

  if (!getTask(id)) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  return NextResponse.json({ history: getHistory(id) });
}
