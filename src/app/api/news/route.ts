import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const news = await db.news.findMany({
      orderBy: { publishedAt: "desc" },
    })
    return NextResponse.json(news)
  } catch (error) {
    console.error("News error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const newsItem = await db.news.create({
      data: {
        newsId: body.id || `news_${Date.now()}`,
        titleAr: body.title_ar,
        titleEn: body.title_en,
        contentAr: body.content_ar,
        contentEn: body.content_en,
        author: body.author,
        category: body.category,
        featured: body.featured || false,
        publishedAt: new Date(body.publishedAt || Date.now()),
      },
    })
    return NextResponse.json(newsItem)
  } catch (error) {
    console.error("News create error:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
