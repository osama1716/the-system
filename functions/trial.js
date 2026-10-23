// The last days of a new account's free trial (2026-10-23): a notification two
// days before it ends and one on its last day, so nobody's trial runs out
// unannounced. Sent by sendTrialNotices (server/trial.js) once an hour, and only
// while the paywall is on — with it off there is no trial to end.
//
// Pure, so it can be tested without Firebase.
"use strict";

const DAY = 86400000;

// Which notice is due for an account made at `createdAt` (ms): "d2" in the day
// before its last day, "d1" on its last day, otherwise null.
function noticeFor(createdAt, now, trialDays) {
  if (!Number.isFinite(createdAt)) return null;
  const left = createdAt + trialDays * DAY - now;
  if (left <= 0) return null;
  if (left <= DAY) return "d1";
  if (left <= 2 * DAY) return "d2";
  return null;
}

const NOTICE_TEXT = {
  en: { d2: { title: "Two days left in your trial", body: "Keep your quests, habits and AI valuing: see the plans." },
    d1: { title: "Last day of your free trial", body: "Subscribe today to keep everything you have built." } },
  ar: { d2: { title: "بقي يومان على نهاية تجربتك", body: "حافظ على مهامك وعاداتك وتقييم الذكاء الاصطناعي: اطّلع على الخطط." },
    d1: { title: "اليوم آخر يوم في تجربتك المجانية", body: "اشترك اليوم لتحتفظ بكل ما بنيته." } },
  es: { d2: { title: "Quedan dos días de tu prueba", body: "Conserva tus misiones, hábitos y la valoración por IA: mira los planes." },
    d1: { title: "Último día de tu prueba gratis", body: "Suscríbete hoy para conservar todo lo que has construido." } },
  fr: { d2: { title: "Plus que deux jours d’essai", body: "Gardez vos quêtes, habitudes et l’évaluation par l’IA : voyez les formules." },
    d1: { title: "Dernier jour de votre essai gratuit", body: "Abonnez-vous aujourd’hui pour garder tout ce que vous avez construit." } },
  de: { d2: { title: "Noch zwei Tage Testphase", body: "Behalte deine Aufgaben, Gewohnheiten und die KI-Bewertung: sieh dir die Tarife an." },
    d1: { title: "Letzter Tag deiner Gratis-Testphase", body: "Abonniere heute, um alles zu behalten, was du aufgebaut hast." } },
  ja: { d2: { title: "無料体験は残り2日です", body: "クエスト・習慣・AI評価を続けるには、プランをご覧ください。" },
    d1: { title: "今日が無料体験の最終日です", body: "今日登録すれば、積み上げたものをすべて続けられます。" } },
  zh: { d2: { title: "免费试用还剩两天", body: "想保留任务、习惯和AI评估？看看订阅方案。" },
    d1: { title: "今天是免费试用的最后一天", body: "今天订阅，保留你建立的一切。" } },
};

function noticePayload(kind, lang) {
  const t = (NOTICE_TEXT[lang] || NOTICE_TEXT.en)[kind];
  return { title: t.title, body: t.body, tag: "trial", url: "./" };
}

module.exports = { DAY, noticeFor, NOTICE_TEXT, noticePayload };
