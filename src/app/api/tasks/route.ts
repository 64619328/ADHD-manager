import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { createTask, getTasks, isTaskPriority, normalizeDeadline, normalizeText } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ tasks: await getTasks() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { goal?: unknown; todos?: unknown; deadlineAt?: unknown; priority?: unknown }
      | null;
    const goal = normalizeText(body?.goal);
    const deadlineAt = normalizeDeadline(body?.deadlineAt);
    const priority = body?.priority ?? "P2";
    const todos = Array.isArray(body?.todos)
      ? body.todos.map((todo) => normalizeText(todo)).filter(Boolean)
      : [];

    if (!goal) {
      return NextResponse.json({ error: "任务目标不能为空" }, { status: 400 });
    }

    if (body?.deadlineAt && !deadlineAt) {
      return NextResponse.json({ error: "DDL 时间无效" }, { status: 400 });
    }

    if (!isTaskPriority(priority)) {
      return NextResponse.json({ error: "任务优先级无效" }, { status: 400 });
    }

    return NextResponse.json({ task: await createTask(goal, todos, deadlineAt, priority) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
