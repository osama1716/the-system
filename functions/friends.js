// Friends: who may ask whom, and what a request turns into.
//
// Pure, so tests/test-friends.js can hold it. A friendship is one document,
// friendships/{pairId}, named by both uids in order so there is exactly one
// per pair however it came about: { users: [a, b], status: "pending" |
// "accepted", from, to }. Server-written only; each side may read its own.

const MAX_FRIENDS = 200;
const REQUESTS_PER_DAY = 30;
const INVITES_PER_DAY = 10;
const INVITE_DAYS = 7;

function pairId(a, b) {
  return a < b ? a + "__" + b : b + "__" + a;
}

// ISO week, UTC: "2026-W38". The weekly ranking resets on Monday.
function weekKeyOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

// What asking `them` to be friends does, given what already stands.
//   "self" | "blocked" | "already-friends" | "already-sent" | "accept" |
//   "full" | "create"
// Asking someone who has already asked you is simply saying yes.
function decideRequest(input) {
  const { me, them, existing, blocked, friendCount } = input;
  if (!me || !them || me === them) return "self";
  if (blocked) return "blocked";
  if (existing && existing.status === "accepted") return "already-friends";
  if (existing && existing.status === "pending") return existing.from === me ? "already-sent" : "accept";
  if ((Number(friendCount) || 0) >= MAX_FRIENDS) return "full";
  return "create";
}

// The weekly figure on a ranking row after an event of `delta` in week `wk`:
// added to this week's, or starting a new week.
function nextWeek(row, wk, delta) {
  const same = row && row.weekKey === wk;
  return { weekKey: wk, weekExp: (same ? Number(row.weekExp) || 0 : 0) + delta };
}

// Notification wording, in the receiver's language.
const WORDS = {
  en: { request: "Friend request", requestBody: "{name} wants to be friends", accepted: "New friend", acceptedBody: "{name} accepted your friend request", invited: "New friend", invitedBody: "{name} joined through your invite" },
  ar: { request: "طلب صداقة", requestBody: "{name} يريد أن يصبح صديقك", accepted: "صديق جديد", acceptedBody: "{name} قبل طلب صداقتك", invited: "صديق جديد", invitedBody: "{name} انضم من خلال دعوتك" },
  es: { request: "Solicitud de amistad", requestBody: "{name} quiere ser tu amigo", accepted: "Nuevo amigo", acceptedBody: "{name} aceptó tu solicitud", invited: "Nuevo amigo", invitedBody: "{name} se unió con tu invitación" },
  fr: { request: "Demande d'ami", requestBody: "{name} veut devenir votre ami", accepted: "Nouvel ami", acceptedBody: "{name} a accepté votre demande", invited: "Nouvel ami", invitedBody: "{name} a rejoint via votre invitation" },
  de: { request: "Freundschaftsanfrage", requestBody: "{name} möchte befreundet sein", accepted: "Neuer Freund", acceptedBody: "{name} hat deine Anfrage angenommen", invited: "Neuer Freund", invitedBody: "{name} ist über deine Einladung dabei" },
  ja: { request: "フレンド申請", requestBody: "{name}さんがフレンドになりたがっています", accepted: "新しいフレンド", acceptedBody: "{name}さんが申請を承認しました", invited: "新しいフレンド", invitedBody: "{name}さんが招待から参加しました" },
  zh: { request: "好友请求", requestBody: "{name} 想加你为好友", accepted: "新好友", acceptedBody: "{name} 接受了你的好友请求", invited: "新好友", invitedBody: "{name} 通过你的邀请加入了" },
};
function message(lang, kind, name) {
  const w = WORDS[lang] || WORDS.en;
  return { title: w[kind], body: w[kind + "Body"].split("{name}").join(String(name || "").slice(0, 30)) };
}

module.exports = { MAX_FRIENDS, REQUESTS_PER_DAY, INVITES_PER_DAY, INVITE_DAYS, pairId, weekKeyOf, decideRequest, nextWeek, message };
