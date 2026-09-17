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
//   "self" | "blocked-by" | "you-blocked" | "already-friends" |
//   "already-sent" | "accept" | "full" | "create"
// Asking someone who has already asked you is simply saying yes. Being
// blocked is said plainly, with who did it; having blocked them yourself
// means unblocking first.
function decideRequest(input) {
  const { me, them, existing, blockedBy, youBlocked, friendCount } = input;
  if (!me || !them || me === them) return "self";
  if (blockedBy) return "blocked-by";
  if (youBlocked) return "you-blocked";
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
const RACE_WORDS = {
  en: { challenge: "Race challenge", challengeBody: "{name} challenged you to a weekly race", raceOn: "Race on", raceOnBody: "{name} accepted — 7 days, go!", raceWon: "You won the race", raceWonBody: "Against {name}: {mine} – {theirs}", raceLost: "Race over", raceLostBody: "{name} won: {theirs} – {mine}", raceTie: "It's a tie", raceTieBody: "With {name}: {mine} – {theirs}" },
  ar: { challenge: "تحدٍّ جديد", challengeBody: "{name} تحدّاك في سباق أسبوعي", raceOn: "بدأ السباق", raceOnBody: "{name} قبل التحدي — 7 أيام، انطلق!", raceWon: "فزت بالسباق", raceWonBody: "ضد {name}: {mine} – {theirs}", raceLost: "انتهى السباق", raceLostBody: "فاز {name}: {theirs} – {mine}", raceTie: "تعادل", raceTieBody: "مع {name}: {mine} – {theirs}" },
  es: { challenge: "Desafío", challengeBody: "{name} te desafió a una carrera semanal", raceOn: "Carrera en marcha", raceOnBody: "{name} aceptó: ¡7 días, adelante!", raceWon: "Ganaste la carrera", raceWonBody: "Contra {name}: {mine} – {theirs}", raceLost: "Carrera terminada", raceLostBody: "Ganó {name}: {theirs} – {mine}", raceTie: "Empate", raceTieBody: "Con {name}: {mine} – {theirs}" },
  fr: { challenge: "Défi", challengeBody: "{name} vous défie à une course hebdomadaire", raceOn: "Course lancée", raceOnBody: "{name} a accepté — 7 jours, go !", raceWon: "Course gagnée", raceWonBody: "Contre {name} : {mine} – {theirs}", raceLost: "Course terminée", raceLostBody: "{name} a gagné : {theirs} – {mine}", raceTie: "Égalité", raceTieBody: "Avec {name} : {mine} – {theirs}" },
  de: { challenge: "Herausforderung", challengeBody: "{name} fordert dich zu einem Wochenrennen heraus", raceOn: "Rennen läuft", raceOnBody: "{name} hat angenommen – 7 Tage, los!", raceWon: "Rennen gewonnen", raceWonBody: "Gegen {name}: {mine} – {theirs}", raceLost: "Rennen vorbei", raceLostBody: "{name} hat gewonnen: {theirs} – {mine}", raceTie: "Unentschieden", raceTieBody: "Mit {name}: {mine} – {theirs}" },
  ja: { challenge: "レースの挑戦", challengeBody: "{name}さんから週間レースの挑戦", raceOn: "レース開始", raceOnBody: "{name}さんが承認 — 7日間、スタート！", raceWon: "レースに勝利", raceWonBody: "{name}さんに {mine} – {theirs}", raceLost: "レース終了", raceLostBody: "{name}さんの勝ち: {theirs} – {mine}", raceTie: "引き分け", raceTieBody: "{name}さんと {mine} – {theirs}" },
  zh: { challenge: "比赛挑战", challengeBody: "{name} 向你发起了每周比赛", raceOn: "比赛开始", raceOnBody: "{name} 接受了——7天，开始！", raceWon: "你赢了比赛", raceWonBody: "对 {name}：{mine} – {theirs}", raceLost: "比赛结束", raceLostBody: "{name} 获胜：{theirs} – {mine}", raceTie: "平局", raceTieBody: "与 {name}：{mine} – {theirs}" },
};

function message(lang, kind, name, vars) {
  const w = { ...(WORDS[lang] || WORDS.en), ...(RACE_WORDS[lang] || RACE_WORDS.en) };
  let body = w[kind + "Body"].split("{name}").join(String(name || "").slice(0, 30));
  Object.keys(vars || {}).forEach((k) => { body = body.split("{" + k + "}").join(String(vars[k])); });
  return { title: w[kind], body };
}

module.exports = { MAX_FRIENDS, REQUESTS_PER_DAY, INVITES_PER_DAY, INVITE_DAYS, pairId, weekKeyOf, decideRequest, nextWeek, message };
