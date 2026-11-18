import { CONTACT } from "@/lib/contact";

// What students read when Rajveer answers. The same text shows in the app and in the email.

export const CONTACT_LINES = `WhatsApp: ${CONTACT.whatsappDisplay}\nEmail: ${CONTACT.email}`;

const OWN_KEY_LINE =
  "If you don't want to wait, you can use your own key: Apify gives every account $5 free each month. Add it in Hunting Fox under Account → Use your own keys, and your searches won't count.";

const first = (name?: string | null) => (name || "").trim().split(/\s+/)[0] || "there";

export function approvedMessage(name: string | null | undefined, n: number, left: number) {
  return `Hi ${first(name)},\n\nGood news: I've added ${n} more searches to your account, so you now have ${left} left. They're ready now. Open Hunting Fox and paste your next job.\n\nIf you've had a reply or an interview, I'd love to hear about it. You can reach me here:\n${CONTACT_LINES}\n\nRajveer`;
}

export function noUsedALot(name: string | null | undefined, used: number) {
  return `Hi ${first(name)},\n\nThanks for asking, and I'm really glad Hunting Fox has been useful. You've already used ${used} searches, which is more than most people so far.\n\nHunting Fox is a personal project, and I pay for every search myself. I'm nearly at the end of my credit, and many students haven't used their searches yet. I want to give them a fair chance, so I can't add more searches for you right now.\n\nI've added you to the waiting list. If there's credit left once others have had their turn, I'll add more searches for you and let you know here.\n\n${OWN_KEY_LINE}\n\nRajveer`;
}

export function noCreditOut(name: string | null | undefined) {
  return `Hi ${first(name)},\n\nThanks for asking. Hunting Fox is a personal project that I pay for myself, and I'm nearly out of credit. A lot of students haven't used their searches yet, so I'm keeping what's left for them, and I can't add more searches for now.\n\nI've put you on the waiting list. If I get a chance to add more, I'll approve yours and you'll hear from me here.\n\n${OWN_KEY_LINE}\n\nRajveer`;
}

export function signupNotYet(name: string | null | undefined) {
  return `Hi ${first(name)},\n\nThanks for signing up. Hunting Fox is a personal project I'm paying for myself, so I can only let a small number of students in while I test it, and I've reached that limit.\n\nI've kept your place on the waiting list. If a spot opens up, I'll let you in and tell you here. There's no need to sign up again.\n\nRajveer`;
}

/** Every email ends with the contact, so students can reply on WhatsApp. */
export function withContact(text: string) {
  return text.includes(CONTACT.email) ? text : `${text}\n\n—\n${CONTACT_LINES}`;
}
