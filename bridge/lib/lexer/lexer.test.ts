const value = `# Bridge

## Overview

### Why this exists

#### Notes`;

export const lexerExpectedOutput = [
  { kind: "H1", text: "Bridge" },
  { kind: "H2", text: "Overview" },
  { kind: "H3", text: "Why this exists" },
  { kind: "H4", text: "Notes" },
];


function evaluateExpressionAssert(left: string, right: string){

}
