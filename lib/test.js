const Language = require('../lib/language')
const EventEmitter = require('events')
const { Lexer, Parser } = Language

const acc = 'àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœűŰőŐ'
const spec = '\\\\.,\\/#!$%@&<>\\^\\*;:{}=\\-\\+_`~()\'"'

class Test extends Language {
  constructor(handler) {
    super()
    
    this.lexer.addTokenClasses([
      // new Lexer.TokenClass('comment', /\/\/.*(?=\r?\n|$)/iu),
      new Lexer.TokenClass('int', /[0-9]+(?![0-9]*\.[0-9]+)/),
      // new Lexer.TokenClass('float', /[0-9]+\.[0-9]+/),
      // new Lexer.TokenClass('bool', /(?:\b)(true|false)(?!\w)/iu),
      // new Lexer.TokenClass('not', /(?:\b)not(?!\w)/iu),
      // new Lexer.TokenClass('and', /(?:\b)and(?!\w)/iu),
      // new Lexer.TokenClass('or', /(?:\b)or(?!\w)/iu),
      // new Lexer.TokenClass('draw-cmd', /(?:\b)(fd|forward|bk|backward|rt|right|lt|left)(?!\w)/iu),
      // new Lexer.TokenClass('objparam-cmd', /(?:\b)(firstput|lastput|item|member\?)(?!\w)/iu),
      // new Lexer.TokenClass('strparam-cmd', /(?:\b)(make|local)(?!\w)/iu),
      // new Lexer.TokenClass('general-cmd', /(?:\b)(list\?|number\?|word\?|output|thing|setpencolor|setpenwidth|setpen|setpc|towards)(?!\w)/iu),
      // new Lexer.TokenClass('moreparam-cmd', /(?:\b)(print)(?!\w)/iu),
      // new Lexer.TokenClass('twoormoreparam-cmd', /(?:\b)(list|word|sentence)(?!\w)/iu),
      // new Lexer.TokenClass('list-cmd', /(?:\b)(first|last|butfirst|butlast|uppercase|lowercase|count|empty\?|run|setposition)(?!\w)/iu),
      // new Lexer.TokenClass('math-cmd', /(?:\b)(abs|sin|cos|tan|arcsin|arccos|arctan|exp|integer|int|log10|log|random|round|sqrt|wait|setx|sety|setheading)(?!\w)/iu),
      // new Lexer.TokenClass('twomath-cmd', /(?:\b)(power|pow)(?!\w)/iu),
      // new Lexer.TokenClass('if-cmd', /(?:\b)if(?!\w)/iu),
      // new Lexer.TokenClass('for-cmd', /(?:\b)(for|repeat)(?!\w)/iu),
      // new Lexer.TokenClass('to-cmd', /(?:\b)to(?!\w)/iu),
      // new Lexer.TokenClass('end', /(?:\b)end(?!\w)/iu),
      // new Lexer.TokenClass('noparam-cmd', /(?:\b)(pi|date|time|stop|heading|hideturtle|showturtle|shown\?|position|xpos|ypos|home|clean|clearscreen|cs|pendown|pd|penup|pu|penwidth|pencolor|pc|pen|e)(?!\w)/iu),
      // new Lexer.TokenClass('word', new RegExp('"[a-z' + acc + spec + '0-9]*', 'iu')),
      // new Lexer.TokenClass('var', new RegExp(':[a-z' + acc + '0-9]+', 'iu')),
      // new Lexer.TokenClass('literal', new RegExp('[a-z' + acc + '0-9]+', 'iu')),
      new Lexer.TokenClass('char', /\S/iu)
    ])
    
    // this.parser.fromBNF(
    //   `<Program> ::= <Program> <ProgramPart> | ""
    //   <SubProgram> ::= "[" <Program> "]"
    //   <OptionalSubProgram> ::= <SubProgram> | ""
    //   
    //   <ProgramPart> ::= <Token-comment> | <Runnable>
    //   <Runnable> ::= <DrawCommand> | <ListCommand> | <GeneralCommand> | <ObjectParamCommand> | <StringParamCommand> | <MathCommand> | <TwoMathCommand> | <NoparamCommand> | <For> | <If> | <To> | <MoreParamCommand>
    //   
    //   <For> ::= <Token-for-cmd> <Math> <SubProgram>
    //   <If> ::= <Token-if-cmd> <Bool> <SubProgram> <OptionalSubProgram>
    //   <To> ::= <Token-to-cmd> <Token-literal> <Variables> <Program> <Token-end>
    //   
    //   <List> ::= "[" <ListInner> "]"
    //   <Expression> ::= <Token-var> | <UserDefined> | <Runnable>
    //   <Parameter> ::= <Bool> | <ListOrString>
    //   <GeneralCommand> ::= <Token-general-cmd> <Parameter>
    //   <ListCommand> ::= <Token-list-cmd> <Parameter>
    //   <StringParamCommand> ::= <Token-strparam-cmd> <String> <Parameter>
    //   <ObjectParamCommand> ::= <Token-objparam-cmd> <Parameter> <Parameter>
    //   <MathCommand> ::= <Token-math-cmd> <Math>
    //   <TwoMathCommand> ::= <Token-twomath-cmd> <Math> <Math>
    //   <NoparamCommand> ::= <Token-noparam-cmd>
    //   <ListOrString> ::= <String> | <List>
    //   <String> ::= <Token-word>
    //   <DrawCommand> ::= <Token-draw-cmd> <Math>
    //   <Variables> ::= <Variables> <Token-var> | ""
    //   <ListInner> ::= <ListInner> <Parameter> | ""
    //   <MoreParamCommand> ::= <Token-moreparam-cmd> <Parameter> | <Token-twoormoreparam-cmd> <Parameter> <Parameter>
    //   <UserDefined> ::= <Token-literal> <Parameters>
    //   <Parameters> ::= <Parameters> <Parameter> | "" | <Token-EOF>
    //   
    //   <Group> ::= "(" <more-cmd> <Parameters> ")"
    //   <more-cmd> ::= <Token-twoormoreparam-cmd> | <Token-moreparam-cmd> | ""
    //   
    //   // Math expressions
    //   <Math> ::= <MathTerm> "+" <Math> | <MathTerm> "-" <Math> | <MathTerm>
    //   <MathTerm> ::= <MaybeSignedMathFactor> "*" <MathTerm> | <MaybeSignedMathFactor> "/" <MathTerm> | <MaybeSignedMathFactor> "%" <MathTerm> | <MaybeSignedMathFactor>
    //   <MaybeSignedMathFactor> ::= "+" <MathLiteral> | "-" <MathLiteral> | <MathLiteral>
    //   <MathLiteral> ::= <Expression> | <Token-int> | <Token-float>
    //   
    //   // Boolean expressions
    //   <Bool> ::= <BoolAND> <Token-or> <Bool> | <BoolAND>
    //   <BoolAND> ::= <BoolEQ> <Token-and> <BoolAND> | <BoolEQ>
    //   <BoolEQ> ::= <BoolCOMP> "==" <BoolEQ> | <BoolCOMP> "!=" <BoolEQ> | <BoolCOMP>
    //   <BoolCOMP> ::= <BoolNOT> "<" <BoolCOMP> | <BoolNOT> ">" <BoolCOMP> | <BoolNOT> "<=" <BoolCOMP> | <BoolNOT> ">=" <BoolCOMP> | <BoolNOT>
    //   <BoolNOT> ::= <Token-not> <BoolLiteral> | <BoolLiteral>
    //   <BoolLiteral> ::= <Math> | <Token-bool>
    //   `
    // )
    
    this.parser.fromBNF(
      `
      <A> ::= <R> <B> <C> <C> <C> "d" | <R> <E> <C> <C> "f" | <B> | <E>
      <R> ::= "r" <C>
      <B> ::= "x" "y"
      <E> ::= "x" "y"
      <C> ::= "" | <C> "c"
      <D> ::= <D> "c" | ""
      `
    )
    
    // this.parser.addDisambiguator('C', node => {
    //   let count = 1
    //   
    //   // while (node)
    //     // console.log(node.parent.parent.node.children.map(child => child.rule.name || child.rule.value))
    //   
    //   // console.log(node.node);
    //   
    //   let c = node.node
    //   while (c.children[0].rule.name === 'C') {
    //     count ++
    //     c = c.children[0]
    //   }
    //   // console.log('C');
    //   // console.log(c.children[0])
    //   return (count > 3)
    // })
    
    this.parser.addDisambiguator('A', stackNode => {
      const countCs = child => {
        let count = 0
        let c = child
        while (c.rule.name === 'C') {
          count ++
          c = c.children[0]
        }
        return count
      }
      let bValue = -1
      return stackNode.node.children.some(child => {
        switch (child.rule.name) {
          case 'R':
            bValue = countCs(child.children[1])
            break
          case 'C':
            if (bValue > 0 && countCs(child) > bValue) return true
            break
        }
      })
    })
  }
  
  execute(code) {
    let pp = (node, indent = 0) => {
      let ind = Array(indent + 1).join('  ')
      console.log(ind + (node.rule.name || node.rule.value))
      node.children.forEach(child => {
        pp(child, indent + 1)
      })
    }
    let ast = this.buildAST(code)
    console.log('--------------------------------')
    console.log('Number of parses: ' + ast.length)
    console.log('--------------------------------')
    // ast.forEach(ast => {
    //   pp(ast[0])
    // })
  }
}

module.exports = Test