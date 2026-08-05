export type TokenType = 
 | "HEADING"
 | "PARAGRAPH"
 | "NEWLINE"
 | "SPACE"

 export interface Token {
  type: TokenType
  // Value gotten from the string
  value: string;
  // nesting level
  level?: number;
  // ?
  alt?: string;
  // In case it is a <a>
  url?: string;
  indent?: string;
 }

 export interface ASTNode {
    type: TokenType;
    children: ASTNode[];
    value: string;
    level?: string;
    alt?: string;
    indent?: string;
    lang?: string;
 }

 function createArray<T extends unknown[]>(...values: T): T {
   return values;
 }

 class Tokenizer {
   tokenize(input: string): Token {
      const tokens: Token[] = [];
      let position = 0;

      const blockPatterns = [
         // * Heading
         createArray(
            /^(#{1,6})\s+(.+)$/gm,
            "HEADING",
            (...factory: string[]) => {
               return {
                  level: factory[0]?.trim().split(" ")[0]?.length,
                  value: factory[0]?.replace(/^#+\s/, "").trim() ?? ""
               }
            }
         ),
         createArray(
            /\n+/, "NEWLINE"
         )
      ];

      while (position < input.length){
         let isMatched = false;

         for (const [regexp, type, handler] of blockPatterns){
            regexp.lastIndex = 0;
            const match = regexp.exec(input.slice(position));

            if (match && match.index === 0){
               const token = handler ? handler(...match): { value: match[0]};
               tokens.push({
                  type,
                  ...token
               } as Token)
            }
         }

      }
   }
 }

 // https://www.youtube.com/watch?v=bY2l_J4jOeM&t=17s