import type { Token } from "../types";
import { TokenType } from "../types";

type TokenHash = Array<{
  key: string;
  value: Token;
}>;

const generateTokenHash = (): TokenHash => {
  const tokenHash: Array<{
    key: string;
    value: Token;
  }> = [
    { key: "\n", value: { type: TokenType.LineBreak } },
    { key: "#", value: { type: TokenType.Header } },
    /* Think on how to handle OrderedList token types*/
    { key: "*", value: { type: TokenType.UnorderedList } },
    { key: "**", value: { type: TokenType.Bold } },
  ];

  return tokenHash;
};

function lookaheadString(input: string, position: number, key: string): boolean {
  let matches = true;
  let keyValueList = key.split("");

  keyValueList.forEach((char, index) => {
    if (input[position + index] !== char) {
      matches = false;
    }key.split("")
  });

  return matches;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let currentPosition = 0;

  // In the string, will move to n position
  while (currentPosition < input.length) {
    const currentToken = input[currentPosition];

    // We skip whitespaces if found.
    if (currentToken === " "){
      currentPosition += 1;
      continue;
    }

    let matched: boolean = false;
    const generatedTokens = generateTokenHash();
    
    for (const {key, value } of generatedTokens){
      // Create look ahead function
      // We check if they don't match (characters), if not
      // we just skip it.
      if (!lookaheadString(input, currentPosition, key)){
        continue;
      }
      tokens.push(value);
      // What key length means in this context?
      currentPosition += key.length;
      matched = true;
    }

    if (matched) continue;
  }

  return tokens;
}
