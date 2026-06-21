import { db } from '../src/lib/db';

async function seed() {
  console.log('Seeding database...');

  // Seed News
  const newsData = [
    {
      newsId: 'launch_announcement',
      titleAr: 'مرحباً بكم في نايل دوجز!',
      titleEn: 'Welcome to NileDogs!',
      contentAr: 'برنامج المؤسسين المبكرين لنايل دوجز مُفعّل الآن! انضم إلينا وابدأ في كسب توكنات NDOG قبل الإطلاق الرسمي في 1 يناير 2028.',
      contentEn: 'NileDogs Early Adopter Program is now LIVE! Join us and start earning NDOG tokens before the official launch on January 1, 2028.',
      author: 'NileDogs Team',
      category: 'announcement',
      featured: true,
      publishedAt: new Date('2024-06-21T00:00:00Z'),
    },
    {
      newsId: 'referral_system_live',
      titleAr: 'نظام الإحالة بـ 3 مستويات مُفعّل!',
      titleEn: '3-Tier Referral System is Live!',
      contentAr: 'اكسب 50 NDOG لكل إحالة مباشرة (L1)، و20 NDOG لإحالات L2، و10 NDOG لإحالات L3. شارك رابطك ووسّع شبكتك!',
      contentEn: 'Earn 50 NDOG for each direct referral (L1), 20 NDOG for L2 referrals, and 10 NDOG for L3 referrals. Share your link and grow your network!',
      author: 'NileDogs Team',
      category: 'feature',
      featured: true,
      publishedAt: new Date('2024-06-21T00:00:00Z'),
    },
  ];

  for (const news of newsData) {
    await db.news.upsert({
      where: { newsId: news.newsId },
      create: news,
      update: news,
    });
  }
  console.log('✅ News seeded');

  // Seed FAQs
  const faqData = [
    { faqId: 'faq_1', questionAr: 'ما هو نايل دوجز (NDOG)؟', questionEn: 'What is NileDogs (NDOG)?', answerAr: 'نايل دوجز هي منصة مكافآت مجتمعية على تيليجرام تتيح لك كسب توكنات NDOG يومياً. انضم لبرنامج المؤسسين المبكرين واكسب قبل الإطلاق الرسمي في 1 يناير 2028.', answerEn: 'NileDogs is a community-driven reward platform on Telegram that lets you earn NDOG tokens daily. Join our Early Adopter Program and earn before the official launch on January 1, 2028.', order: 1 },
    { faqId: 'faq_2', questionAr: 'كيف أكسب توكنات NDOG؟', questionEn: 'How do I earn NDOG tokens?', answerAr: 'يمكنك كسب NDOG عبر الطلب اليومي (10 NDOG/يوم)، مكافآت الإحالة (L1:50, L2:20, L3:10)، إكمال المهام، لعب الألعاب المصغرة، وتقديم توكناتك لاسترباد APR.', answerEn: 'You can earn NDOG through daily claims (10 NDOG/day), referral bonuses (L1:50, L2:20, L3:10), completing missions, playing mini-games, and staking your tokens for APR rewards.', order: 2 },
    { faqId: 'faq_3', questionAr: 'هل الانضمام مجاني؟', questionEn: 'Is it free to join?', answerAr: 'نعم! الانضمام والمشاركة في نظام نايل دوجز مجاني تماماً. سجل بحساب Google الخاص بك وابدأ في الكسب.', answerEn: 'Yes! Joining and participating in the NileDogs ecosystem is completely free. Simply sign in with your Google account and start earning.', order: 3 },
    { faqId: 'faq_4', questionAr: 'ما هي مزايا المؤسسين المبكرين؟', questionEn: 'What is the Early Adopter benefit?', answerAr: 'المؤسسون المبكرون يحصلون على شارة عضو مؤسس التي تمنح مضاعف 1.5x مدى الحياة على جميع الأرباح. هذه الميزة حصرية لمن ينضم قبل الإطلاق الرسمي.', answerEn: 'Early Adopters receive the Founding Member badge which gives a 1.5x lifetime reward multiplier on all earnings. This is exclusive to those who join before the official launch.', order: 4 },
    { faqId: 'faq_5', questionAr: 'متى سيتم إدراج NDOG في البورصات؟', questionEn: 'When will NDOG be listed on exchanges?', answerAr: 'تم التخطيط لتفعيل NDOG على الشبكة الرئيسية في 1 يناير 2028. سيتم الإعلان عن الإدراجات في البورصات كلما اقتربنا من تاريخ الإطلاق.', answerEn: 'NDOG is planned for mainnet activation on January 1, 2028. Exchange listings will be announced as we approach the launch date. Stay tuned for updates!', order: 5 },
    { faqId: 'faq_6', questionAr: 'كيف يعمل الـ Staking؟', questionEn: 'How does staking work?', answerAr: 'يمكنك قفل توكنات NDOG لمدة 7 أو 30 أو 90 أو 180 يوم واكسب APR من 5% إلى 25%. كلما طالت فترة القفل، زادت مكافآتك. يوجد حد أدنى لكل خطة.', answerEn: 'You can lock your NDOG tokens for 7, 30, 90, or 180 days and earn APR from 5% to 25%. The longer you stake, the higher your rewards. Minimum stake amounts apply per plan.', order: 6 },
  ];

  for (const faq of faqData) {
    await db.faq.upsert({
      where: { faqId: faq.faqId },
      create: faq,
      update: faq,
    });
  }
  console.log('✅ FAQs seeded');

  // Seed demo users for leaderboard
  const demoUsers = [
    { email: 'diamond@example.com', name: 'DiamondHolder', displayName: 'DiamondHolder', balance: 150000, streak: 45, totalClaimed: 200000 },
    { email: 'crypto@example.com', name: 'CryptoKing', displayName: 'CryptoKing', balance: 85000, streak: 30, totalClaimed: 120000 },
    { email: 'nilefan@example.com', name: 'NileDog_Fan', displayName: 'NileDog_Fan', balance: 52000, streak: 22, totalClaimed: 78000 },
    { email: 'miner@example.com', name: 'DailyMiner', displayName: 'DailyMiner', balance: 35000, streak: 60, totalClaimed: 45000 },
    { email: 'whale@example.com', name: 'NDOG_Whale', displayName: 'NDOG_Whale', balance: 250000, streak: 15, totalClaimed: 300000 },
    { email: 'starter@example.com', name: 'NewStarter', displayName: 'NewStarter', balance: 500, streak: 3, totalClaimed: 500 },
  ];

  for (const u of demoUsers) {
    await db.user.upsert({
      where: { email: u.email },
      create: { ...u, role: 'user', vipLevel: u.balance >= 100000 ? 'diamond' : u.balance >= 20000 ? 'platinum' : u.balance >= 5000 ? 'gold' : u.balance >= 1000 ? 'silver' : 'bronze' },
      update: {},
    });
  }
  console.log('✅ Demo users seeded');

  console.log('🎉 Database seeded successfully!');
}

seed()
  .catch(console.error)
  .finally(() => process.exit(0));
