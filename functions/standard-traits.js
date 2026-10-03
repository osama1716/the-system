// The standard trait list, as the server knows it.
//
// A copy of SYS.DEFAULT_INT_TYPES (the short codes) and SYS.seedIntelligences
// (the names) in js/constants.js. tests/test-profile.js holds the two
// identical, so editing one without the other fails the run.
//
// Why the server needs it: the public profile is built from the saved state,
// which the device writes. Only names on this list may appear there, so a
// trait renamed by hand on a device cannot put text nobody moderated on a
// page other people read.
"use strict";

const STANDARD = {
  self: {
    short: "SELF",
    traits: [
      ["Self-motivation", "التحفيز الذاتي"],
      ["Reflection & thinking", "التأمل والتفكير"],
      ["Personal goal-setting", "تحديد الأهداف الشخصية"],
      ["Self-evaluation", "التقييم الذاتي"],
      ["Time management", "تنظيم الوقت"],
      ["Emotional regulation", "تنظيم الانفعالات"],
      ["Discipline & consistency", "الانضباط والاستمرارية"],
      ["Focus & attention", "التركيز والانتباه"],
      ["Stress management", "إدارة الضغط"],
      ["Sleep & rest", "النوم والراحة"],
      ["Learning skills", "مهارات التعلّم"],
      ["Personal finance", "إدارة المال الشخصي"],
    ],
  },
  social: {
    short: "SOC",
    traits: [
      ["Volunteering", "العمل التطوعي"],
      ["Social interaction", "التفاعل الاجتماعي"],
      ["Participating in social activities", "المشاركة في الأنشطة الاجتماعية"],
      ["Effective communication", "التواصل الفعال"],
      ["Empathy & listening", "التعاطف والإنصات"],
      ["Teamwork", "العمل الجماعي"],
      ["Leadership", "القيادة"],
      ["Conflict resolution", "حل الخلافات"],
      ["Negotiation & persuasion", "التفاوض والإقناع"],
      ["Friendships", "بناء الصداقات"],
      ["Family relationships", "العلاقات الأسرية"],
      ["Teaching & mentoring", "التعليم والإرشاد"],
    ],
  },
  linguistic: {
    short: "LING",
    traits: [
      ["Reading", "القراءة"],
      ["Writing", "الكتابة"],
      ["Speaking", "التحدث"],
      ["Language learning", "تعلم اللغات"],
      ["Public speaking", "الخطابة وإلقاء العروض"],
      ["Storytelling", "السرد والحكي"],
      ["Vocabulary & expression", "الثروة اللغوية والتعبير"],
      ["Listening comprehension", "الاستيعاب السمعي"],
      ["Debate & argument", "المناظرة والحِجاج"],
      ["Poetry", "الشعر"],
      ["Translation", "الترجمة"],
      ["Editing & proofreading", "التحرير والتدقيق"],
    ],
  },
  logical: {
    short: "LOG",
    traits: [
      ["Data analysis", "تحليل البيانات"],
      ["Puzzle solving", "حل الألغاز"],
      ["Programming", "تعلم البرمجة"],
      ["Sports coaching & training", "التعليم والتدريب الرياضي"],
      ["Mathematics", "الرياضيات"],
      ["Critical thinking", "التفكير النقدي"],
      ["Problem solving", "حل المشكلات"],
      ["Systems & planning", "التفكير المنظومي والتخطيط"],
      ["Scientific method", "المنهج العلمي والتجريب"],
      ["Strategy games", "ألعاب الاستراتيجية"],
      ["Statistics & probability", "الإحصاء والاحتمالات"],
      ["Research", "البحث"],
    ],
  },
  bodily: {
    short: "BODY",
    traits: [
      ["Yoga", "اليوغا"],
      ["Sports", "الرياضة"],
      ["Self-defense techniques", "تقنيات الدفاع عن النفس"],
      ["Handcrafts", "المهارات اليدوية"],
      ["Daily exercise", "التمارين اليومية"],
      ["Acting", "التمثيل"],
      ["Health", "الصحة"],
      ["Strength training", "تمارين القوة"],
      ["Endurance & cardio", "التحمّل واللياقة"],
      ["Flexibility & balance", "المرونة والتوازن"],
      ["Dance & movement", "الرقص والتعبير الحركي"],
      ["Recovery & injury care", "التعافي والوقاية من الإصابات"],
    ],
  },
  natural: {
    short: "NAT",
    traits: [
      ["Survival techniques", "تقنيات البقاء في الطبيعة"],
      ["Outdoor activities", "الأنشطة الخارجية"],
      ["Learning about the environment", "التعلم عن البيئة"],
      ["Farming & gardening", "الزراعة والبستنة"],
      ["Animal care", "رعاية الحيوانات"],
      ["Plant knowledge", "معرفة النباتات"],
      ["Hiking & navigation", "المشي الطويل والتوجّه"],
      ["Sustainability & recycling", "الاستدامة وإعادة التدوير"],
      ["Astronomy & the night sky", "الفلك ومراقبة السماء"],
      ["Camping", "التخييم"],
    ],
  },
  visual: {
    short: "VIS",
    traits: [
      ["3D planning", "التخطيط ثلاثي الأبعاد"],
      ["Graphic design", "التصميم الجرافيكي"],
      ["Photography", "التصوير"],
      ["Drawing", "الرسم"],
      ["Painting & colour", "التلوين واللون"],
      ["Video & editing", "التصوير والمونتاج"],
      ["Space arrangement", "تنسيق المساحات"],
      ["Maps & orientation", "الخرائط والتوجّه المكاني"],
      ["Calligraphy", "الخط"],
      ["Sculpting & modelling", "النحت والتشكيل"],
      ["Animation", "الرسم المتحرك"],
      ["Visual memory", "الذاكرة البصرية"],
    ],
  },
  musical: {
    short: "MUS",
    traits: [
      ["Playing an instrument", "العزف على آلة موسيقية"],
      ["Active listening", "الاستماع النشط"],
      ["Vocal training", "التدريب الصوتي"],
      ["Musical creativity", "الإبداع الموسيقي"],
      ["Rhythm & timing", "الإيقاع والتوقيت"],
      ["Music theory", "نظرية الموسيقى"],
      ["Ear training", "التدريب السمعي"],
      ["Performing", "الأداء أمام جمهور"],
    ],
  },
};

module.exports = { STANDARD };
