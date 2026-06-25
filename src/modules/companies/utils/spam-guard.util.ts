import { AppErrors } from '../../../common/errors';

const SPAM_PATTERNS = [
  /http[s]?:\/\//i,         // URLs
  /\b(viagra|casino|porn|sex|loan|bitcoin|crypto|cpa)\b/i,  // spam keywords
  /[^\x20-\x7Eа-яА-ЯёЁîăâșțÎĂÂȘȚ\s]/u,  // unusual characters
];

const MAX_MESSAGE_LENGTH = 2000;
const MAX_PHONE_LENGTH = 20;
const MIN_MESSAGE_LENGTH = 3;

export function assertNotSpam(message: string | undefined | null, phone: string): void {
  if (!message || message.trim().length < MIN_MESSAGE_LENGTH) {
    throw AppErrors.badRequest('Mesajul este prea scurt.');
  }

  const clean = message.trim();

  if (clean.length > MAX_MESSAGE_LENGTH) {
    throw AppErrors.badRequest(`Mesajul nu poate depăși ${MAX_MESSAGE_LENGTH} de caractere.`);
  }

  // Reject messages that are too repetitive (e.g. "aaaaaaa")
  if (/^(.)\1{15,}$/.test(clean.replace(/\s/g, ''))) {
    throw AppErrors.badRequest('Mesajul conține caractere repetitive suspecte.');
  }

  // Check against spam patterns
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(clean)) {
      throw AppErrors.badRequest('Mesajul conține conținut nerelevant.');
    }
  }

  // Phone sanity check
  if (phone.length > MAX_PHONE_LENGTH) {
    throw AppErrors.badRequest('Numărul de telefon este invalid.');
  }

  // Reject messages with excessive uppercase (shouting/spam indicator)
  const letters = clean.replace(/[^a-zA-Zа-яА-ЯёЁîăâșțÎĂÂȘȚ]/g, '');
  if (letters.length > 20) {
    const uppercaseRatio = (letters.match(/[A-ZА-Я]/g) ?? []).length / letters.length;
    if (uppercaseRatio > 0.7) {
      throw AppErrors.badRequest('Mesajul conține prea multe majuscule.');
    }
  }
}