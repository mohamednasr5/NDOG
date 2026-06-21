import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const faqs = await db.faq.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
    })
    return NextResponse.json(faqs)
  } catch (error) {
    console.error("FAQ error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
