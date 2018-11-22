const Language = require('../lib/language')
const EventEmitter = require('events')
const fs = require('fs')
const { Lexer, Parser } = Language
const { writeGraph } = require('../lib/utils')

class Scope {
  constructor(node) {
    this.node = node
    this.parent = node.scope
    node.scope = this

    this.types = {}
    this.enums = {}
    this.variables = {}
  }

  findType(name) {
    if (!this.parent) {
      return this.types[name]
    } else {
      const local = this.types[name]
      if (!local) {
        return this.parent.findType(name)
      } else {
        return local
      }
    }
  }
}

class ProgramScope extends Scope {
  constructor(node) {
    node.scope = null
    super(node)

    this.types = {
      int: {}
    }
  }
}

class CLang extends Language {
  constructor() {
    super()
  }

  static fromBNF() {
    const c = new CLang()

    // TODO: clean up these names gsus
    const O = `[0-7]`
    const D = `[0-9]`
    const NZ = `[1-9]`
    const L = `[a-zA-Z_]`
    const A = `[a-zA-Z_0-9]`
    const H = `[a-fA-F0-9]`
    const HP = `(0[xX])`
    const E = `([Ee][+-]?${D}+)`
    const P = `([Pp][+-]?${D}+)`
    const FS = `(f|F|l|L)`
    const IS = `(((u|U)(l|L|ll|LL)?)|((l|L|ll|LL)(u|U)?))`
    const CP = `(u|U|L)`
    const SP = `(u8|u|U|L)`
    const ES = `(\\\\(['"\\?\\\\abfnrtv]|[0-7]{1,3}|x[a-fA-F0-9]+))`
    const WS = `[ \\t\\v\\n\\f]`

    c.lexer.addTokenClasses([
      new Lexer.TokenClass('auto', /auto(?!\w)/ui),
      new Lexer.TokenClass('break', /break(?!\w)/ui),
      new Lexer.TokenClass('case', /case(?!\w)/ui),
      new Lexer.TokenClass('char', /char(?!\w)/ui),
      new Lexer.TokenClass('const', /const(?!\w)/ui),
      new Lexer.TokenClass('continue', /continue(?!\w)/ui),
      new Lexer.TokenClass('default', /default(?!\w)/ui),
      new Lexer.TokenClass('do', /do(?!\w)/ui),
      new Lexer.TokenClass('double', /double(?!\w)/ui),
      new Lexer.TokenClass('else', /else(?!\w)/ui),
      new Lexer.TokenClass('enum', /enum(?!\w)/ui),
      new Lexer.TokenClass('extern', /extern(?!\w)/ui),
      new Lexer.TokenClass('float', /float(?!\w)/ui),
      new Lexer.TokenClass('for', /for(?!\w)/ui),
      new Lexer.TokenClass('goto', /goto(?!\w)/ui),
      new Lexer.TokenClass('if', /if(?!\w)/ui),
      new Lexer.TokenClass('inline', /inline(?!\w)/ui),
      new Lexer.TokenClass('int', /int(?!\w)/ui),
      new Lexer.TokenClass('long', /long(?!\w)/ui),
      new Lexer.TokenClass('register', /register(?!\w)/ui),
      new Lexer.TokenClass('restrict', /restrict(?!\w)/ui),
      new Lexer.TokenClass('return', /return(?!\w)/ui),
      new Lexer.TokenClass('short', /short(?!\w)/ui),
      new Lexer.TokenClass('signed', /signed(?!\w)/ui),
      new Lexer.TokenClass('sizeof', /sizeof(?!\w)/ui),
      new Lexer.TokenClass('static', /static(?!\w)/ui),
      new Lexer.TokenClass('struct', /struct(?!\w)/ui),
      new Lexer.TokenClass('switch', /switch(?!\w)/ui),
      new Lexer.TokenClass('typedef', /typedef(?!\w)/ui),
      new Lexer.TokenClass('union', /uinion(?!\w)/ui),
      new Lexer.TokenClass('unsigned', /uinsigned(?!\w)/ui),
      new Lexer.TokenClass('void', /void(?!\w)/ui),
      new Lexer.TokenClass('volatile', /volatile(?!\w)/ui),
      new Lexer.TokenClass('while', /while(?!\w)/ui),

      new Lexer.TokenClass('alignas', /_Alignas(?!\w)/ui),
      new Lexer.TokenClass('alignof', /_Alignof(?!\w)/ui),
      new Lexer.TokenClass('atomic', /_Atomic(?!\w)/ui),
      new Lexer.TokenClass('bool', /_Bool(?!\w)/ui),
      new Lexer.TokenClass('complex', /_Complex(?!\w)/ui),
      new Lexer.TokenClass('generic', /_Generic(?!\w)/ui),
      new Lexer.TokenClass('imaginary', /_Imaginary(?!\w)/ui),
      new Lexer.TokenClass('noreturn', /_Noreturn(?!\w)/ui),
      new Lexer.TokenClass('static-assert', /_Static_assert(?!\w)/ui),
      new Lexer.TokenClass('thread-local', /_Thread_local(?!\w)/ui),
      new Lexer.TokenClass('func-name', /__func__(?!\w)/ui),

      new Lexer.TokenClass('float-dec', new RegExp(
        `${D}*\\.${D}+${E}?${FS}?`, 'u')),
      new Lexer.TokenClass('float-dec-e', new RegExp(
        `${D}+${E}${FS}?`, 'u')),
      new Lexer.TokenClass('float-dec-dot-e', new RegExp(
        `${D}+\\.${E}?${FS}?`, 'u')),
      new Lexer.TokenClass('float-hex', new RegExp(
        `${HP}${H}*\\.${H}+${P}${FS}?`, 'u')),
      new Lexer.TokenClass('float-hex-p', new RegExp(
        `${HP}${H}+${P}${FS}?`, 'u')),
      new Lexer.TokenClass('float-hex-dot-p', new RegExp(
        `${HP}${H}+\\.${P}${FS}?`, 'u')),

      new Lexer.TokenClass('integer-hex', new RegExp(
        `${HP}${H}+${IS}?`, 'u')),
      new Lexer.TokenClass('integer-dec', new RegExp(
        `${NZ}${D}*${IS}?`, 'u')),
      new Lexer.TokenClass('integer-oct', new RegExp(
        `0${O}*${IS}?`, 'u')),
      new Lexer.TokenClass('integer-chr', new RegExp(
        `${CP}?'([^'\\\\\\n]|${ES})+'`, 'u')),

      new Lexer.TokenClass('string', new RegExp(
        `(${SP}?"([^"\\\\\\n]|${ES})*"${WS}*)+`, 'u')),

      new Lexer.TokenClass('ellipsis', /\.\.\./ui),
      new Lexer.TokenClass('right-assign', />>=/ui),
      new Lexer.TokenClass('left-assign', /<<=/ui),
      new Lexer.TokenClass('add-assign', /\+=/ui),
      new Lexer.TokenClass('sub-assign', /-=/ui),
      new Lexer.TokenClass('mul-assign', /\*=/ui),
      new Lexer.TokenClass('div-assign', /\/=/ui),
      new Lexer.TokenClass('mod-assign', /%=/ui),
      new Lexer.TokenClass('and-assign', /&=/ui),
      new Lexer.TokenClass('xor-assign', /\^=/ui),
      new Lexer.TokenClass('or-assign', /\|=/ui),
      new Lexer.TokenClass('right-op', />>/ui),
      new Lexer.TokenClass('left-op', /<</ui),
      new Lexer.TokenClass('inc-op', /\+\+/ui),
      new Lexer.TokenClass('dec-op', /--/ui),
      new Lexer.TokenClass('ptr-op', /->/ui),
      new Lexer.TokenClass('and-op', /&&/ui),
      new Lexer.TokenClass('or-op', /\|\|/ui),
      new Lexer.TokenClass('le-op', /<=/ui),
      new Lexer.TokenClass('ge-op', />=/ui),
      new Lexer.TokenClass('eq-op', /==/ui),
      new Lexer.TokenClass('ne-op', /!=/ui),
      new Lexer.TokenClass('left-curly', /(\{)|(<%)/ui),
      new Lexer.TokenClass('right-curly', /(\})|(%>)/ui),
      new Lexer.TokenClass('left-square', /(\[)|(<:)/ui),
      new Lexer.TokenClass('right-square', /(\])|(:>)/ui),

      new Lexer.TokenClass('identifier', /(?=[a-z_])[a-z0-9_]*(?!\w)/ui),
      new Lexer.TokenClass('char', /\S/ui)
    ])

    c.parser.setupFromBNF(`
      // <S> ::= <E> "=" <E> | "f"
      // <E> ::= <T> | <E> "+" <T>
      // <T> ::= "f" | <T> "*" "f"

      // <S> ::= <E>
      // <E> ::= <T> | "(" <E> ")"
      // <T> ::= "n" | "+" <T> | <T> "+" "n"

      // <E> ::= <T> "+" <E> | <T>
      // <T> ::= "n"

      // <S> ::= "a" <B> <C>
      // <B> ::= "b" | ""
      // <C> ::= "c" | ""

      // <S> ::= "a" <C>
      // <C> ::= ""

      <translation-unit> ::= <external-declaration>
      	| <translation-unit> <external-declaration>

      <primary-expression> ::= <Token-identifier>
        | <constant>
        | <string>
        | "(" <expression> ")"
        | <generic-selection>

      <constant> ::= <integer-constant>
        | <float-constant>
        | <enumeration-constant>

      <integer-constant> ::= <Token-integer-hex>
        | <Token-integer-dec>
        | <Token-integer-oct>
        | <Token-integer-chr>

      <float-constant> ::= <Token-float-dec>
        | <Token-float-dec-e>
        | <Token-float-dec-dot-e>
        | <Token-float-hex>
        | <Token-float-hex-p>
        | <Token-float-hex-dot-p>

      <enumeration-constant> ::= <Token-identifier>

      <string> ::= <Token-string>
        | <Token-func-name>

      <generic-selection> ::=
        <Token-generic> "(" <assignment-expression> "," <generic-assoc-list> ")"

      <generic-assoc-list> ::= <generic-association>
      	| <generic-assoc-list> "," <generic-association>

      <generic-association> ::= <type-name> ":" <assignment-expression>
      	| <Token-default> ":" <assignment-expression>

      <postfix-expression> ::= <primary-expression>
      	| <postfix-expression> <Token-left-square> <expression> <Token-right-square>
      	| <postfix-expression> "(" ")"
      	| <postfix-expression> "(" <argument-expression-list> ")"
      	| <postfix-expression> "." <Token-identifier>
      	| <postfix-expression> <Token-ptr-op> <Token-identifier>
      	| <postfix-expression> <Token-inc-op>
      	| <postfix-expression> <Token-dec-op>
      	| "(" <type-name> ")" <Token-left-curly> <initializer-list> <Token-right-curly>
      	| "(" <type-name> ")" <Token-left-curly> <initializer-list> "," <Token-right-curly>

      <argument-expression-list> ::= <assignment-expression>
      	| <argument-expression-list> "," <assignment-expression>

      <unary-expression> ::= <postfix-expression>
      	| <Token-inc-op> <unary-expression>
      	| <Token-dec-op> <unary-expression>
      	| <unary-operator> <cast-expression>
      	| <Token-sizeof> <unary-expression>
      	| <Token-sizeof> "(" <type-name> ")"
      	| <Token-alignof> "(" <type-name> ")"

      <unary-operator> ::= "&"
      	| "*"
      	| "+"
      	| "-"
      	| "~"
      	| "!"

      <cast-expression> ::= <unary-expression>
      	| "(" <type-name> ")" <cast-expression>

      <multiplicative-expression> ::= <cast-expression>
      	| <multiplicative-expression> "*" <cast-expression>
      	| <multiplicative-expression> "/" <cast-expression>
      	| <multiplicative-expression> "%" <cast-expression>

      <additive-expression> ::= <multiplicative-expression>
      	| <additive-expression> "+" <multiplicative-expression>
      	| <additive-expression> "-" <multiplicative-expression>

      <shift-expression> ::= <additive-expression>
      	| <shift-expression> <Token-left-op> <additive-expression>
      	| <shift-expression> <Token-right-op> <additive-expression>

      <relational-expression> ::= <shift-expression>
      	| <relational-expression> "<" <shift-expression>
      	| <relational-expression> ">" <shift-expression>
      	| <relational-expression> <Token-le-op> <shift-expression>
      	| <relational-expression> <Token-ge-op> <shift-expression>

      <equality-expression> ::= <relational-expression>
      	| <equality-expression> <Token-eq-op> <relational-expression>
      	| <equality-expression> <Token-ne-op> <relational-expression>

      <and-expression> ::= <equality-expression>
      	| <and-expression> "&" <equality-expression>

      <exclusive-or-expression> ::= <and-expression>
      	| <exclusive-or-expression> "^" <and-expression>

      <inclusive-or-expression> ::= <exclusive-or-expression>
      	| <inclusive-or-expression> "|" <exclusive-or-expression>

      <logical-and-expression> ::= <inclusive-or-expression>
      	| <logical-and-expression> <Token-and-op> <inclusive-or-expression>

      <logical-or-expression> ::= <logical-and-expression>
      	| <logical-or-expression> <Token-or-op> <logical-and-expression>

      <conditional-expression> ::= <logical-or-expression>
      	| <logical-or-expression> "?" <expression> ":" <conditional-expression>

      <assignment-expression> ::= <conditional-expression>
      	| <unary-expression> <assignment-operator> <assignment-expression>

      <assignment-operator> ::= "="
      	| <Token-mul-assign>
      	| <Token-div-assign>
      	| <Token-mod-assign>
      	| <Token-add-assign>
      	| <Token-sub-assign>
      	| <Token-left-assign>
      	| <Token-right-assign>
      	| <Token-and-assign>
      	| <Token-xor-assign>
      	| <Token-or-assign>

      <expression> ::= <assignment-expression>
      	| <expression> "," <assignment-expression>

      <constant-expression> ::= <conditional-expression>

      <declaration> ::= <declaration-specifiers> ";"
      	| <declaration-specifiers> <init-declarator-list> ";"
      	| <static-assert-declaration>

      <declaration-specifiers> ::= <storage-class-specifier> <declaration-specifiers>
      	| <storage-class-specifier>
      	| <type-specifier> <declaration-specifiers>
      	| <type-specifier>
      	| <type-qualifier> <declaration-specifiers>
      	| <type-qualifier>
      	| <function-specifier> <declaration-specifiers>
      	| <function-specifier>
      	| <alignment-specifier> <declaration-specifiers>
      	| <alignment-specifier>

      <init-declarator-list> ::= <init-declarator>
      	| <init-declarator-list> "," <init-declarator>

      <init-declarator> ::= <declarator> "=" <initializer>
      	| <declarator>

      <storage-class-specifier> ::= <Token-typedef>
      	| <Token-extern>
      	| <Token-static>
      	| <Token-thread-local>
      	| <Token-auto>
      	| <Token-register>

      <type-specifier> ::= <Token-void>
      	| <Token-char>
      	| <Token-short>
      	| <Token-int>
      	| <Token-long>
      	| <Token-float>
      	| <Token-double>
      	| <Token-signed>
      	| <Token-unsigned>
      	| <Token-bool>
      	| <Token-complex>
      	| <Token-imaginary>
      	| <atomic-type-specifier>
      	| <struct-or-union-specifier>
      	| <enum-specifier>
      	| <Token-identifier> // typedef-name

      <struct-or-union-specifier> ::= <struct-or-union> <Token-left-curly> <struct-declaration-list> <Token-right-curly>
      	| <struct-or-union> <Token-identifier> <Token-left-curly> <struct-declaration-list> <Token-right-curly>
      	| <struct-or-union> <Token-identifier>

      <struct-or-union> ::= <Token-struct> | <Token-union>

      <struct-declaration-list> ::= <struct-declaration>
      	| <struct-declaration-list> <struct-declaration>

      <struct-declaration> ::= <specifier-qualifier-list> ";"
      	| <specifier-qualifier-list> <struct-declarator-list> ";"
      	| <static-assert-declaration>

      <specifier-qualifier-list> ::= <type-specifier> <specifier-qualifier-list>
      	| <type-specifier>
      	| <type-qualifier> <specifier-qualifier-list>
      	| <type-qualifier>

      <struct-declarator-list> ::= <struct-declarator>
      	| <struct-declarator-list> "," <struct-declarator>

      <struct-declarator> ::= ":" <constant-expression>
      	| <declarator> ":" <constant-expression>
      	| <declarator>

      <enum-specifier> ::= <Token-enum> <Token-left-curly> <enumerator-list> <Token-right-curly>
      	| <Token-enum> <Token-left-curly> <enumerator-list> "," <Token-right-curly>
      	| <Token-enum> <Token-identifier> <Token-left-curly> <enumerator-list> <Token-right-curly>
      	| <Token-enum> <Token-identifier> <Token-left-curly> <enumerator-list> "," <Token-right-curly>
      	| <Token-enum> <Token-identifier>

      <enumerator-list> ::= <enumerator>
      	| <enumerator-list> "," <enumerator>

      <enumerator> ::= <enumeration-constant> "=" <constant-expression>
      	| <enumeration-constant>

      <atomic-type-specifier> ::= <Token-atomic> "(" <type-name> ")"

      <type-qualifier> ::= <Token-const>
      	| <Token-restrict>
      	| <Token-volatile>
      	| <Token-atomic>

      <function-specifier> ::= <Token-inline>
      	| <Token-noreturn>

      <alignment-specifier> ::= <Token-alignas> "(" <type-name> ")"
      	| <Token-alignas> "(" <constant-expression> ")"

      <declarator> ::= <pointer> <direct-declarator>
      	| <direct-declarator>

      <direct-declarator> ::= <Token-identifier>
      	| "(" <declarator> ")"
      	| <direct-declarator> <Token-left-square> <Token-right-square>
      	| <direct-declarator> <Token-left-square> "*" <Token-right-square>
      	| <direct-declarator> <Token-left-square> <Token-static> <type-qualifier-list> <assignment-expression> <Token-right-square>
      	| <direct-declarator> <Token-left-square> <Token-static> <assignment-expression> <Token-right-square>
      	| <direct-declarator> <Token-left-square> <type-qualifier-list> "*" <Token-right-square>
      	| <direct-declarator> <Token-left-square> <type-qualifier-list> <Token-static> <assignment-expression> <Token-right-square>
      	| <direct-declarator> <Token-left-square> <type-qualifier-list> <assignment-expression> <Token-right-square>
      	| <direct-declarator> <Token-left-square> <type-qualifier-list> <Token-right-square>
      	| <direct-declarator> <Token-left-square> <assignment-expression> <Token-right-square>
      	| <direct-declarator> "(" <parameter-type-list> ")"
      	| <direct-declarator> "(" ")"
      	| <direct-declarator> "(" <identifier-list> ")"

      <pointer> ::= "*" <type-qualifier-list> <pointer>
      	| "*" <type-qualifier-list>
      	| "*" <pointer>
      	| "*"

      <type-qualifier-list> ::= <type-qualifier>
      	| <type-qualifier-list> <type-qualifier>


      <parameter-type-list> ::= <parameter-list> "," <Token-ellipsis>
      	| <parameter-list>

      <parameter-list> ::= <parameter-declaration>
      	| <parameter-list> "," <parameter-declaration>

      <parameter-declaration> ::= <declaration-specifiers> <declarator>
      	| <declaration-specifiers> <abstract-declarator>
      	| <declaration-specifiers>

      <identifier-list> ::= <Token-identifier>
      	| <identifier-list> "," <Token-identifier>

      <type-name> ::= <specifier-qualifier-list> <abstract-declarator>
      	| <specifier-qualifier-list>

      <abstract-declarator> ::= <pointer> <direct-abstract-declarator>
      	| <pointer>
      	| <direct-abstract-declarator>

      <direct-abstract-declarator> ::= "(" <abstract-declarator> ")"
      	| <Token-left-square> <Token-right-square>
      	| <Token-left-square> "*" <Token-right-square>
      	| <Token-left-square> <Token-static> <type-qualifier-list> <assignment-expression> <Token-right-square>
      	| <Token-left-square> <Token-static> <assignment-expression> <Token-right-square>
      	| <Token-left-square> <type-qualifier-list> <Token-static> <assignment-expression> <Token-right-square>
      	| <Token-left-square> <type-qualifier-list> <assignment-expression> <Token-right-square>
      	| <Token-left-square> <type-qualifier-list> <Token-right-square>
      	| <Token-left-square> <assignment-expression> <Token-right-square>
      	| <direct-abstract-declarator> <Token-left-square> <Token-right-square>
      	| <direct-abstract-declarator> <Token-left-square> "*" <Token-right-square>
      	| <direct-abstract-declarator> <Token-left-square> <Token-static> <type-qualifier-list> <assignment-expression> <Token-right-square>
      	| <direct-abstract-declarator> <Token-left-square> <Token-static> <assignment-expression> <Token-right-square>
      	| <direct-abstract-declarator> <Token-left-square> <type-qualifier-list> <assignment-expression> <Token-right-square>
      	| <direct-abstract-declarator> <Token-left-square> <type-qualifier-list> <Token-static> <assignment-expression> <Token-right-square>
      	| <direct-abstract-declarator> <Token-left-square> <type-qualifier-list> <Token-right-square>
      	| <direct-abstract-declarator> <Token-left-square> <assignment-expression> <Token-right-square>
      	| "(" ")"
      	| "(" <parameter-type-list> ")"
      	| <direct-abstract-declarator> "(" ")"
      	| <direct-abstract-declarator> "(" <parameter-type-list> ")"

      <initializer> ::= <Token-left-curly> <initializer-list> <Token-right-curly>
      	| <Token-left-curly> <initializer-list> "," <Token-right-curly>
      	| <assignment-expression>

      <initializer-list> ::= <designation> <initializer>
      	| <initializer>
      	| <initializer-list> "," <designation> <initializer>
      	| <initializer-list> "," <initializer>

      <designation> ::= <designator-list> "="

      <designator-list> ::= <designator>
      	| <designator-list> <designator>

      <designator> ::= <Token-left-square> <constant-expression> <Token-right-square>
      	| "." <Token-identifier>

      <static-assert-declaration> ::= <Token-static-assert> "(" <constant-expression> "," <Token-string> ")" ";"

      <statement> ::= <labeled-statement>
      	| <compound-statement>
      	| <expression-statement>
      	| <selection-statement>
      	| <iteration-statement>
      	| <jump-statement>

      <labeled-statement> ::= <Token-identifier> ":" <statement>
      	| <Token-case> <constant-expression> ":" <statement>
      	| <Token-default> ":" <statement>

      <compound-statement> ::= <Token-left-curly> <Token-right-curly>
      	| <Token-left-curly> <block-item-list> <Token-right-curly>

      <block-item-list> ::= <block-item>
      	| <block-item-list> <block-item>

      <block-item> ::= <declaration>
      	| <statement>

      <expression-statement> ::= ";"
      	| <expression> ";"

      <selection-statement> ::= <Token-if> "(" <expression> ")" <statement> <Token-else> <statement>
      	| <Token-if> "(" <expression> ")" <statement>
      	| <Token-switch> "(" <expression> ")" <statement>

      <iteration-statement> ::= <Token-while> "(" <expression> ")" <statement>
      	| <Token-do> <statement> <Token-while> "(" <expression> ")" ";"
      	| <Token-for> "(" <expression-statement> <expression-statement> ")" <statement>
      	| <Token-for> "(" <expression-statement> <expression-statement> <expression> ")" <statement>
      	| <Token-for> "(" <declaration> <expression-statement> ")" <statement>
      	| <Token-for> "(" <declaration> <expression-statement> <expression> ")" <statement>

      <jump-statement> ::= <Token-goto> <Token-identifier> ";"
      	| <Token-continue> ";"
      	| <Token-break> ";"
      	| <Token-return> ";"
      	| <Token-return> <expression> ";"

      <external-declaration> ::= <function-definition>
      	| <declaration>

      <function-definition> ::= <declaration-specifiers> <declarator> <declaration-list> <compound-statement>
      	| <declaration-specifiers> <declarator> <compound-statement>

      <declaration-list> ::= <declaration>
      	| <declaration-list> <declaration>
    `)

    fs.writeFile('c.parser', c.save(), () => {})

    return c
  }

  static fromSave() {
    const c = new CLang()
    c.load(fs.readFileSync('c.parser'))
    return c
  }

  execute(code) {
    try {
      const sppf = this.buildSPPF(code)
      this.executeSPPF(sppf)
    } catch (e) {
      throw e
    }
  }

  executeSPPF(sppf) {
    try {
      const toString = (node, seen = []) => {
        seen = seen.concat(node)

        if (node.item && node.item.value !== undefined) {
          return node.item.value.length > 0 ?
            node.item.value : 'Ɛ'
        } else {
          const str = node.arcs.map((arc, i) => {
            if (seen.indexOf(arc) >= 0) {
              return ``
            } else {
              return toString(arc, seen)
            }
          }).join('')

          if (node instanceof Parser.SPPF.IntermediateNode)
            return str
          return node.arcs.length > 1 ? `(${str})` : str
        }
      }

      const getDeclarationSpecifierList = (node) => {
        if (node.ruleName === 'declaration-specifiers') {
          const specifiers = []

          do {
            specifiers.push(node.arcs[0])
            node = node.arcs[1]
          } while (node && node.ruleName === 'declaration-specifiers')

          return specifiers
        } else {
          return []
        }
      }

      const getPreList = (ruleName, node) => {
        if (node.ruleName === ruleName) {
          const declarators = []

          do {
            const arcs = node.flattenArcs()
            declarators.unshift(arcs[arcs.length - 1])
            node = arcs[0]
          } while (node && node.ruleName === ruleName)

          return declarators
        } else {
          return []
        }
      }

      sppf.transform([(node) => {
        switch (node.ruleName) {
          case 'declaration':
          case 'parameter-declaration':
          case 'function-definition': {
            node.arcs = node.arcs.filter(arc => {
              const specifiers = getDeclarationSpecifierList(arc.arcs[0])

              const typeSpecifierCount = specifiers.reduce((count, spec) => {
                if (spec.ruleName === 'type-specifier') {
                  return count + 1
                } else {
                  return count
                }
              }, 0)

              if (typeSpecifierCount > 1) {
                return false
              }

              return true
            })
          } break
          default: {
            node.arcs.forEach((arc, i) => {
              writeGraph(arc, `${node.ruleName}_${i}`)
            })
          }
        }
      }])

      new ProgramScope(sppf.root)
      sppf.root.traverse((node) => {
        switch (node.ruleName) {
          case 'declaration': {
            const specifiers = getDeclarationSpecifierList(node.arcs[0])
            const typenameSpec = specifiers.find(
              spec => spec.ruleName === 'type-specifier')

            if (typenameSpec) {
              const descendants = typenameSpec.getDirectDescendants()
              const typename = descendants[descendants.length - 1].item.value

              if (node.scope.findType(typename)) {

                const scsps = specifiers.filter(
                  spec => spec.ruleName === 'storage-class-specifier')
                if (scsps.find(s => s.arcs[0].ruleName === 'typedef')) {
                  const initDeclarators =
                    getPreList('init-declarator-list', node.flattenArcs()[1])

                  initDeclarators.forEach(declarator => {
                    const descendants = declarator.getDirectDescendants()
                    const name = descendants[descendants.length - 1].item.value

                    node.scope.types[name] = node.scope.findType(typename)
                  })
                }

              } else {
                const scopeOwner = node.scope.node
                if (scopeOwner instanceof Parser.SPPF.PackedNode) {
                  scopeOwner.parent.arcs = scopeOwner.parent.arcs.filter(
                    a => a !== scopeOwner)
                  // maybe merge scopes here
                } else {
                  console.log(`type error '${typename}'`)
                }
              }
            }
          } break
          case 'postfix-expression': {
            const arcs = node.flattenArcs()

            // function call
            if (arcs.length === 4 &&
                arcs[0].ruleName === 'postfix-expression' &&
                arcs[2].ruleName === 'argument-expression-list') {
              const descendants = arcs[0].getDirectDescendants()
              const functionName =
                descendants[descendants.length - 1].item.value

              const arglist = getPreList('argument-expression-list', arcs[2])

              console.log(functionName)
              arglist.forEach(arg => {
                const descendants = arg.getDirectDescendants()

                console.log(descendants[descendants.length - 1].item.value);
              })
            }

            // console.log(node.flattenArcs().map(a => a.ruleName));
          } break
        }

        node.arcs.forEach(arc => {
          arc.scope = node.scope

          if (arc instanceof Parser.SPPF.PackedNode) {
            new Scope(arc)
          } else if (arc.ruleName === 'compound-statement') {
            if (arc instanceof Parser.SPPF.SymbolNode) {
              new Scope(arc)
            }
          }
        })
      })

      writeGraph(sppf.root)
      const trees = sppf.trees
      console.log(trees.length);

      const exec = (node) => {
        const resolve = (arcs) => {
          return arcs.map(arc => {
            if (arc instanceof Parser.SPPF.IntermediateNode) {
              return resolve(arc.arcs)
            } else {
              return arc
            }
          }).reduce((a, x) => a.concat(x), [])
        }
        const args = resolve(node.arcs).map(exec)

        if (node.item.class) {
          return node.item.value
        }
      }

      trees.forEach(tree => {
        // console.log(`${code} | ${toString(tree)}`);
        // const result = exec(tree)
        // console.log(`Result: ${result}`)
        // console.log('=================================================')
      })
    } catch (e) {
      console.log(e)
    }
  }
}

module.exports = CLang
