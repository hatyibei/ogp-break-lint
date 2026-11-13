// `linebreak` ships no type definitions. Only the parts we use.
declare module "linebreak" {
  interface Break {
    position: number;
    required: boolean;
  }
  export default class LineBreaker {
    constructor(text: string);
    nextBreak(): Break | null;
  }
}
