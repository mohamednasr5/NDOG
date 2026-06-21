import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 })
  }

  try {
    const notifications = await db.notification.findMany({
      where: { userId },
      orderBy: { ts: "desc" },
      take: 50,
    })
    return NextResponse.json(notifications)
  } catch (error) {
    console.error("Notifications error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { userId, title, message } = await req.json()
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 })
    }
    const notification = await db.notification.create({
      data: { userId, title: title || "Notification", message: message || "", },
    })
    return NextResponse.json(notification)
  } catch (error) {
    console.error("Notification create error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
