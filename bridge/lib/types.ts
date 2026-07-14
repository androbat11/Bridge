// https://www.markdownguide.org/basic-syntax/
// https://balit.boxxen.org/overview/
export enum TokenType {
  Header = "Header",
  Paragraph = "Paragraph",
  /* Will support code block latner */
  // OrderedList = "OrderedList",
  UnorderedList = "UnorderedList",
  Bold = "Bold",
  Italic = "Italic",
  LineBreak = "LineBreak",
  /* Link - Will also be supported later */
}

export type TokenNode<T extends TokenType> = {
  type: T;
};

export interface TokenValueNode<T extends TokenType> extends TokenNode<T> {
  value: string;
}

export type Token =
  | TokenNode<TokenType.Header>
  | TokenNode<TokenType.Paragraph>
  | TokenNode<TokenType.OrderedList>
  | TokenNode<TokenType.UnorderedList>
  | TokenValueNode<TokenType.Italic>
  | TokenValueNode<TokenType.Bold>;

/* 
[
  { type: 'LineBreak' },
  { type: 'VariableDeclaration' },
  { type: 'Literal', value: 'hello' },
  { type: 'AssignmentOperator' },
  { type: 'String', value: 'world' },
  { type: 'LineBreak' },
  { type: 'Log' },
  { type: 'Literal', value: 'hello' },
  { type: 'LineBreak' }
]


*/

/* 

{
  type: 'Program',
  children: [
    {
      type: 'Assignment',
      name: 'hello',
      value: {
        type: 'String',
        value: 'world'
      }
    },
    {
      type: 'Log',
      children: [
        {
          type: 'Literal',
          value: 'hello'
        }
      ]
    }
  ]
}
*/

/*
Markdown AST

{
 type: Document
 children: [
    {

    }
 ]
}

*/
