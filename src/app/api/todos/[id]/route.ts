import { NextResponse } from "next/server";
import { deleteTodo, normalizeText, updateTodo } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id: idValue } = await context.params;
  const id = parseId(idValue);

  if (!id) {
    return NextResponse.json({ error: "待办 ID 无效" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { content?: unknown; completed?: unknown } | null;
  const updates: Parameters<typeof updateTodo>[1] = {};

  if (body && Object.hasOwn(body, "content")) {
    const content = normalizeText(body.content);
    if (!content) {
      return NextResponse.json({ error: "待办内容不能为空" }, { status: 400 });
    }
    updates.content = content;
  }

  if (body && Object.hasOwn(body, "completed")) {
    if (typeof body.completed !== "boolean") {
      return NextResponse.json({ error: "待办完成状态无效" }, { status: 400 });
    }
    updates.completed = body.completed;
  }

  const task = updateTodo(id, updates);
  if (!task) {
    return NextResponse.json({ error: "待办不存在" }, { status: 404 });
  }

  return NextResponse.json({ task });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id: idValue } = await context.params;
  const id = parseId(idValue);

  if (!id) {
    return NextResponse.json({ error: "待办 ID 无效" }, { status: 400 });
  }

  const task = deleteTodo(id);
  if (!task) {
    return NextResponse.json({ error: "待办不存在" }, { status: 404 });
  }

  return NextResponse.json({ task });
}
