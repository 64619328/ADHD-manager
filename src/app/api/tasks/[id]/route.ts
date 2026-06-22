import { NextResponse } from "next/server";
import { getTask, isTaskPriority, isTaskStatus, normalizeDeadline, normalizeText, updateTask } from "@/lib/db";

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

  const task = getTask(id);
  if (!task) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  return NextResponse.json({ task });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id: idValue } = await context.params;
  const id = parseId(idValue);

  if (!id) {
    return NextResponse.json({ error: "任务 ID 无效" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | { goal?: unknown; status?: unknown; deadlineAt?: unknown; priority?: unknown }
    | null;
  const updates: Parameters<typeof updateTask>[1] = {};

  if (body && Object.hasOwn(body, "goal")) {
    const goal = normalizeText(body.goal);
    if (!goal) {
      return NextResponse.json({ error: "任务目标不能为空" }, { status: 400 });
    }
    updates.goal = goal;
  }

  if (body && Object.hasOwn(body, "status")) {
    if (!isTaskStatus(body.status)) {
      return NextResponse.json({ error: "任务状态无效" }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (body && Object.hasOwn(body, "deadlineAt")) {
    const deadlineAt = normalizeDeadline(body.deadlineAt);
    if (body.deadlineAt && !deadlineAt) {
      return NextResponse.json({ error: "DDL 时间无效" }, { status: 400 });
    }
    updates.deadlineAt = deadlineAt;
  }

  if (body && Object.hasOwn(body, "priority")) {
    if (!isTaskPriority(body.priority)) {
      return NextResponse.json({ error: "任务优先级无效" }, { status: 400 });
    }
    updates.priority = body.priority;
  }

  const task = updateTask(id, updates);
  if (!task) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  return NextResponse.json({ task });
}
