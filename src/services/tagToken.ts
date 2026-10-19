import { randomInt } from "node:crypto";
import { PolyTagRepository } from "../repositories/polytagRepository.js";

// Excludes visually ambiguous characters such as 0/O and 1/I/L.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomCode(length = 8): string {
  let value = "";
  for (let i = 0; i < length; i += 1) {
    value += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return value;
}

export async function generateUniqueTagToken(
  repository: PolyTagRepository,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const token = `PT-${randomCode()}`;
    if (!(await repository.tagExists(token))) return token;
  }

  throw new Error("Could not generate a unique PolyTag ID after several attempts");
}
