export function generateExpressionEngineFactory<Expression>(){
    const isEq = (left: Expression, right: Expression) => left === right;
    const isNotEq = (left: Expression, right: Expression) => !isEq(left, right);
    return {
        isEq,
        isNotEq
    }

}

export function tokenize(input: string){
    const values = input.split("\n");
    values.forEach(expression => {
        
    })
}

console.log(tokenize(`# Hello
  Title with a text
  `))