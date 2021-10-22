const Language = require('../lib/language')
const EventEmitter = require('events')
const fs = require('fs')
const { Lexer, Parser } = Language
const { writeGraph } = require('../lib/utils')

class CLang extends Language {
  constructor() {
    super()
  }

  static fromBNF() {
    const c = new CLang()

    c.lexer.skipEOL = false
    // c.lexer.skipWhitespace = false

    const Octal = `[0-7]`
    const Decimal = `[0-9]`
    const NonZero = `[1-9]`
    const Letter = `[a-zA-Z_]`
    const Alphanumeric = `[a-zA-Z_0-9]`
    const Hex = `[a-fA-F0-9]`
    const HexPrefix = `(0[xX])`
    const E = `([Ee][+-]?${Decimal}+)`
    const P = `([Pp][+-]?${Decimal}+)`
    const FloatSpecifier = `(f|F|l|L)`
    const IntegerSpecifier = `(((u|U)(l|L|ll|LL)?)|((l|L|ll|LL)(u|U)?))`
    const CharPrefix = `(u|U|L)`
    const StringPrefix = `(u8|u|U|L)`
    const EscapeSequence = `(\\\\(['"\\?\\\\abfnrtv]|${Octal}{1,3}|x${Hex}+))`
    const WhiteSpace = `[ \\t\\v\\n\\f]`

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
        `${Decimal}*\\.${Decimal}+${E}?${FloatSpecifier}?`, 'u')),
      new Lexer.TokenClass('float-dec-e', new RegExp(
        `${Decimal}+${E}${FloatSpecifier}?`, 'u')),
      new Lexer.TokenClass('float-dec-dot-e', new RegExp(
        `${Decimal}+\\.${E}?${FloatSpecifier}?`, 'u')),
      new Lexer.TokenClass('float-hex', new RegExp(
        `${HexPrefix}${Hex}*\\.${Hex}+${P}${FloatSpecifier}?`, 'u')),
      new Lexer.TokenClass('float-hex-p', new RegExp(
        `${HexPrefix}${Hex}+${P}${FloatSpecifier}?`, 'u')),
      new Lexer.TokenClass('float-hex-dot-p', new RegExp(
        `${HexPrefix}${Hex}+\\.${P}${FloatSpecifier}?`, 'u')),

      new Lexer.TokenClass('integer-hex', new RegExp(
        `${HexPrefix}${Hex}+${IntegerSpecifier}?`, 'u')),
      new Lexer.TokenClass('integer-dec', new RegExp(
        `${NonZero}${Decimal}*${IntegerSpecifier}?`, 'u')),
      new Lexer.TokenClass('integer-oct', new RegExp(
        `0${Octal}*${IntegerSpecifier}?`, 'u')),
      new Lexer.TokenClass('integer-chr', new RegExp(
        `${CharPrefix}?'([^'\\\\\\n]|${EscapeSequence})+'`, 'u')),

      new Lexer.TokenClass('string', new RegExp(
        `(${StringPrefix}?"([^"\\\\\\n]|${EscapeSequence})*"${WhiteSpace}*)+`,
        'u')),

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

      new Lexer.TokenClass('identifier', new RegExp(
        `(?=${Letter})${Alphanumeric}*(?!\\w)`, 'u')),
      new Lexer.TokenClass('char', /\S/ui)
    ])

    c.parser.setupFromEBNF(`

      // root = preprocessing-file ?
      //
      // translation-unit = declaration-seq ?
      //
      // typedef-name = identifier
      // namespace-name = identifier
      // class-name = identifier
      //   | simple-template-id
      // enum-name = identifier
      // template-name = identifier
      // hex-quad = hex-digit hex-digit hex-digit hex-digit
      // universal-character-name = "\\u" hex-quad
      //   | "\\U" hex-quad hex-quad
      // preprocessing-token = ( header-name
      //   | identifier
      //   | pp-number
      //   | character-literal
      //   | user-defined-character-literal
      //   | string-literal
      //   | user-defined-string-literal
      //   | preprocessing-op-or-punc )
      //   | /\\s/
      //
      // // token = identifier
      // //   | keyword
      // //   | literal
      // //   | operator
      // //   | punctuator
      // // keyword = "alignas" | "continue" | "friend" | "register" | "true"
      // //   | "alignof" | "decltype" | "goto" | "reinterpret_cast" | "try"
      // //   | "asm" | "default" | "if" | "return" | "typedef"
      // //   | "auto" | "delete" | "inline" | "short" | "typeid"
      // //   | "bool" | "do" | "int" | "signed" | "typename"
      // //   | "break" | "double" | "long" | "sizeof" | "union"
      // //   | "case" | "dynamic_cast" | "mutable" | "static" | "unsigned"
      // //   | "catch" | "else" | "namespace" | "static_assert" | "using"
      // //   | "char" | "enum" | "new" | "static_cast" | "virtual"
      // //   | "char16_t" | "explicit" | "noexcept" | "struct" | "void"
      // //   | "char32_t" | "export" | "nullptr" | "switch" | "volatile"
      // //   | "class" | "extern" | "operator" | "template" | "wchar_t"
      // //   | "const" | "false" | "private" | "this" | "while"
      // //   | "constexpr" | "float" | "protected" | "thread_local"
      // //   | "const_cast" | "for" | "public" | "throw"
      //
      // header-name = "<" /[^>\\n]/ui + ">"
      //   | '"' /[^"\\n]/ui + '"'
      // pp-number = digit
      //   | "." digit
      //   | pp-number digit
      //   | pp-number identifier-nondigit
      //   | pp-number "'" digit
      //   | pp-number "'" nondigit
      //   | pp-number /e/i sign
      //   | pp-number "."
      // identifier = identifier-nondigit
      //   | identifier identifier-nondigit
      //   | identifier digit
      // identifier-nondigit = nondigit
      //   | universal-character-name
      // nondigit = /[a-z_]/i
      // digit = /[0-9]/
      // preprocessing-op-or-punc = "{" | "}" | "[" | "]" | "#" | "##" | "(" | ")"
      //   | "<:" | ":>" | "<%" | "%>" | "%:" | "%:%:" | ";" | ":" | "..."
      //   | "new" | "delete" | "?" | "::" | "." | ".*"
      //   | "+" | "-" | "*" | "/" | "%" | "^" | "&" | "|" | "~"
      //   | "!" | "=" | "<" | ">" | "+=" | "-=" | "*=" | "/=" | "%="
      //   | "^=" | "&=" | "|=" | "<<" | ">>" | ">>=" | "<<=" | "==" | "!="
      //   | "<=" | ">=" | "&&" | "||" | "++" | "--" | "," | "->*" | "->"
      //   | "and" | "and_eq" | "bitand" | "bitor" | "compl" | "not" | "not_eq"
      //   | "or" | "or_eq" | "xor" | "xor_eq"
      // literal = integer-literal
      //   | character-literal
      //   | floating-literal
      //   | string-literal
      //   | boolean-literal
      //   | pointer-literal
      //   | user-defined-literal
      // integer-literal = binary-literal integer-suffix ?
      //   | octal-literal integer-suffix ?
      //   | decimal-literal integer-suffix ?
      //   | hexadecimal-literal integer-suffix ?
      // binary-literal = "0" /b/i binary-digit
      //   | binary-literal /'?/ binary-digit
      // octal-literal = "0"
      //   | octal-literal /'?/ octal-digit
      // decimal-literal = nonzero-digit
      //   | decimal-literal /'?/ digit
      // hexadecimal-literal = "0" /x/i hex-digit
      //   | hexadecimal-literal /'?/ hex-digit
      // binary-digit = /[0-1]/
      // octal-digit = /[0-7]/
      // nonzero-digit = /[1-9]/
      // hex-digit = /[0-9a-f]/i
      // integer-suffix = unsigned-suffix long-suffix ?
      //   | unsigned-suffix long-long-suffix ?
      //   | long-suffix unsigned-suffix ?
      //   | long-long-suffix unsigned-suffix ?
      // unsigned-suffix = /u/i
      // long-suffix = /l/i
      // long-long-suffix = "ll" | "LL"
      // character-literal = encoding-prefix ? "'" c-char-sequence "'"
      // encoding-prefix = "u8" | /u/i | "L"
      // c-char-sequence = c-char +
      // c-char = /[^'\\\\\\n]/
      //   | escape-sequence
      //   | universal-character-name
      // escape-sequence = simple-escape-sequence
      //   | octal-escape-sequence
      //   | hexadecimal-escape-sequence
      // simple-escape-sequence = "\\'" | '\\"' | "\\?" | "\\\\"
      //   | "\\a" | "\\b" | "\\f" | "\\n" | "\\r" | "\\t" | "\\v"
      // octal-escape-sequence = "\\" octal-digit
      //   | "\\" octal-digit octal-digit
      //   | "\\" octal-digit octal-digit octal-digit
      // hexadecimal-escape-sequence = "\\x" hex-digit
      //   | hexadecimal-escape-sequence hex-digit
      // floating-literal = fractional-constant exponent-part ? floating-suffix ?
      //   | digit-sequence exponent-part floating-suffix ?
      // fractional-constant = digit-sequence ? digit-sequence
      //   | digit-sequence "."
      // exponent-part = /e/i sign ? digit-sequence
      // sign = "+" | "-"
      // digit-sequence = digit
      //   | digit-sequence /'?/ digit
      // floating-suffix = /[fl]/i
      // string-literal = encoding-prefix ? '"' s-char-sequence ? '"'
      //   | encoding-prefix ? "R" raw-string
      // s-char-sequence = s-char
      //   | s-char-sequence s-char
      // s-char = /[^'\\\\\\n]/
      //   | escape-sequence
      //   | universal-character-name
      // raw-string = '"' d-char-sequence ? "(" r-char-sequence ? ")" d-char-sequence ? '"'
      // r-char-sequence = r-char
      //   | r-char-sequence r-char
      // r-char = /./
      // d-char-sequence = d-char +
      // d-char = /[^\\(\\)\\\\\t\v\n\f]/
      // boolean-literal = "false" | "true"
      // pointer-literal = "nullptr"
      // user-defined-literal = user-defined-integer-literal
      //   | user-defined-floating-literal
      //   | user-defined-string-literal
      //   | user-defined-character-literal
      // user-defined-integer-literal = decimal-literal ud-suffix
      //   | octal-literal ud-suffix
      //   | hexadecimal-literal ud-suffix
      //   | binary-literal ud-suffix
      // user-defined-floating-literal = fractional-constant exponent-part ? ud-suffix
      //   | digit-sequence exponent-part ud-suffix
      // user-defined-string-literal = string-literal ud-suffix
      // user-defined-character-literal = character-literal ud-suffix
      // ud-suffix = identifier
      //
      // primary-expression = literal
      //   | "this"
      //   | "(" expression ")"
      //   | id-expression
      //   | lambda-expression
      //   | fold-expression
      // id-expression = unqualified-id
      //   | qualified-id
      // unqualified-id = identifier
      //   | operator-function-id
      //   | conversion-function-id
      //   | literal-operator-id
      //   | "~" class-name
      //   | "~" decltype-specifier
      //   | template-id
      // qualified-id = nested-name-specifier "template" ? unqualified-id
      // nested-name-specifier = "::"
      //   | type-name "::"
      //   | namespace-name "::"
      //   | decltype-specifier "::"
      //   | nested-name-specifier identifier "::"
      //   | nested-name-specifier "template" ? simple-template-id "::"
      // lambda-expression = lambda-introducer lambda-declarator ? compound-statement
      // lambda-introducer = "[" lambda-capture ? "]"
      // lambda-capture = capture-default
      //   | capture-list
      //   | capture-default "," capture-list
      // capture-default = "&" | "="
      // capture-list = capture "..." ?
      //   | capture-list "," capture "..." ?
      // capture = simple-capture | init-capture
      // simple-capture = identifier | "&" identifier | "this"
      // init-capture = identifier initializer
      //   | "&" identifier initializer
      // lambda-declarator = "(" parameter-declaration-clause ")" "mutable" ? exception-specification ? attribute-specifier-seq ? trailing-return-type?
      // fold-expression = "(" cast-expression fold-operator "..." ")"
      // "(" "..." fold-operator cast-expression ")"
      // "(" cast-expression fold-operator "..." fold-operator cast-expression ")"
      // fold-operator = "+" | "-" | "*" | "/" | "%" | "^" | "&" | "|" | "<<"
      //   | ">>" | "+=" | "-=" | "*=" | "/=" | "%=" | "^=" | "&=" | "|=" | "<<="
      //   | ">>=" | "=" | "==" | "!=" | "<" | ">" | "<=" | ">=" | "&&" | "||"
      //   | "," | ".*" | "->*"
      // postfix-expression = primary-expression
      //   | postfix-expression "[" expression "]"
      //   | postfix-expression "[" braced-init-list "]"
      //   | postfix-expression "(" expression-list ? ")"
      //   | simple-type-specifier "(" expression-list ? ")"
      //   | typename-specifier "(" expression-list ? ")"
      //   | simple-type-specifier braced-init-list
      //   | typename-specifier braced-init-list
      //   | postfix-expression "." "template" ? id-expression
      //   | postfix-expression "->" "template" ? id-expression
      //   | postfix-expression "." pseudo-destructor-name
      //   | postfix-expression "->" pseudo-destructor-name
      //   | postfix-expression "++"
      //   | postfix-expression "--"
      //   | "dynamic_cast" "<" type-id ">" "(" expression ")"
      //   | "static_cast" "<" type-id ">" "(" expression ")"
      //   | "reinterpret_cast" "<" type-id ">" "(" expression ")"
      //   | "const_cast" "<" type-id ">" "(" expression ")"
      //   | "typeid" "(" expression ")"
      //   | "typeid" "(" type-id ")"
      // expression-list = initializer-list
      // pseudo-destructor-name = nested-name-specifier ? type-name "::" "~" type-name
      //   | nested-name-specifier "template" simple-template-id "::" "~" type-name
      //   | "~" type-name
      //   | "~" decltype-specifier
      // unary-expression = postfix-expression
      //   | "++" cast-expression
      //   | "--" cast-expression
      //   | unary-operator cast-expression
      //   | "sizeof" unary-expression
      //   | "sizeof" "(" type-id ")"
      //   | "sizeof" "..." "(" identifier ")"
      //   | "alignof" "(" type-id ")"
      //   | noexcept-expression
      //   | new-expression
      //   | delete-expression
      // unary-operator = "*" | "&" | "+" | "-" | "!" | "~"
      // new-expression = "::" ? "new" new-placement ? new-type-id new-initializer ?
      //   | "::" ? "new" new-placement ? "(" type-id ")" new-initializer ?
      // new-placement = "(" expression-list ")"
      // new-type-id = type-specifier-seq new-declarator ?
      // new-declarator = ptr-operator new-declarator ?
      //   | noptr-new-declarator
      // noptr-new-declarator = "[" expression "]" attribute-specifier-seq ?
      //   | noptr-new-declarator "[" constant-expression "]" attribute-specifier-seq ?
      // new-initializer = "(" expression-list ? ")"
      //   | braced-init-list
      // delete-expression = "::" ? "delete" cast-expression
      //   | "::" ? "delete" "[" "]" cast-expression
      // noexcept-expression = "noexcept" "(" expression ")"
      // cast-expression = unary-expression
      //   | "(" type-id ")" cast-expression
      // pm-expression = cast-expression
      //   | pm-expression ".*" cast-expression
      //   | pm-expression "->*" cast-expression
      // multiplicative-expression = pm-expression
      //   | multiplicative-expression "*" pm-expression
      //   | multiplicative-expression "/" pm-expression
      //   | multiplicative-expression "%" pm-expression
      // additive-expression = multiplicative-expression
      //   | additive-expression "+" multiplicative-expression
      //   | additive-expression "-" multiplicative-expression
      // shift-expression = additive-expression
      //   | shift-expression "<<" additive-expression
      //   | shift-expression ">>" additive-expression
      // relational-expression = shift-expression
      //   | relational-expression "<" shift-expression
      //   | relational-expression ">" shift-expression
      //   | relational-expression "<=" shift-expression
      //   | relational-expression ">=" shift-expression
      // equality-expression = relational-expression
      //   | equality-expression "==" relational-expression
      //   | equality-expression "!=" relational-expression
      // and-expression = equality-expression
      //   | and-expression "&" equality-expression
      // exclusive-or-expression = and-expression
      //   | exclusive-or-expression "^" and-expression
      // inclusive-or-expression = exclusive-or-expression
      //   | inclusive-or-expression "|" exclusive-or-expression
      // logical-and-expression = inclusive-or-expression
      //   | logical-and-expression "&&" inclusive-or-expression
      // logical-or-expression = logical-and-expression
      //   | logical-or-expression "||" logical-and-expression
      // conditional-expression = logical-or-expression
      //   | logical-or-expression "?" expression ":" assignment-expression
      // throw-expression = "throw" assignment-expression ?
      // assignment-expression = conditional-expression
      //   | logical-or-expression assignment-operator initializer-clause
      //   | throw-expression
      // assignment-operator = "=" | "*=" | "/=" | "%=" | "+=" | "-=" | ">>="
      //   | "<<=" | "&=" | "^=" | "|="
      // expression = assignment-expression
      //   | expression "," assignment-expression
      // constant-expression = conditional-expression
      //
      // statement = labeled-statement
      //   | attribute-specifier-seq ? expression-statement
      //   | attribute-specifier-seq ? compound-statement
      //   | attribute-specifier-seq ? selection-statement
      //   | attribute-specifier-seq ? iteration-statement
      //   | attribute-specifier-seq ? jump-statement
      //   | declaration-statement
      //   | attribute-specifier-seq ? try-block
      // labeled-statement = attribute-specifier-seq ? identifier ":" statement
      //   | attribute-specifier-seq ? "case" constant-expression ":" statement
      //   | attribute-specifier-seq ? "default" ":" statement
      // expression-statement = expression ? ";"
      // compound-statement = "{" statement-seq ? "}"
      // statement-seq = statement
      //   | statement-seq statement
      // selection-statement = "if" "(" condition ")" statement
      //   | "if" "(" condition ")" statement "else" statement
      //   | "switch" "(" condition ")" statement
      // condition = expression
      //   | attribute-specifier-seq ? decl-specifier-seq declarator "=" initializer-clause
      //   | attribute-specifier-seq ? decl-specifier-seq declarator braced-init-list
      // iteration-statement = "while" "(" condition ")" statement
      //   | "do" statement "while" "(" expression ")" ";"
      //   | "for" "(" for-init-statement condition ? ";" expression ? ")" statement
      //   | "for" "(" for-range-declaration ":" for-range-initializer ")" statement
      // for-init-statement = expression-statement
      //   | simple-declaration
      // for-range-declaration = attribute-specifier-seq ? decl-specifier-seq declarator
      // for-range-initializer = expression
      //   | braced-init-list
      // jump-statement = "break" ";"
      //   | "continue" ";"
      //   | "return" expression ? ";"
      //   | "return" braced-init-list ";"
      //   | "goto" identifier ";"
      // declaration-statement = block-declaration
      //
      // declaration-seq = declaration
      //   | declaration-seq declaration
      // declaration = block-declaration
      //   | function-definition
      //   | template-declaration
      //   | explicit-instantiation
      //   | explicit-specialization
      //   | linkage-specification
      //   | namespace-definition
      //   | empty-declaration
      //   | attribute-declaration
      // block-declaration = simple-declaration
      //   | asm-definition
      //   | namespace-alias-definition
      //   | using-declaration
      //   | using-directive
      //   | static_assert-declaration
      //   | alias-declaration
      //   | opaque-enum-declaration
      // alias-declaration = "using" identifier attribute-specifier-seq ? "=" type-id ";"
      // simple-declaration = decl-specifier-seq ? init-declarator-list ? ";"
      //   | attribute-specifier-seq decl-specifier-seq ? init-declarator-list ";"
      // static_assert-declaration = "static_assert" "(" constant-expression ")" ";"
      //   | "static_assert" "(" constant-expression "," string-literal ")" ";"
      // empty-declaration = ";"
      // attribute-declaration = attribute-specifier-seq ";"
      // decl-specifier = storage-class-specifier
      //   | type-specifier
      //   | function-specifier
      //   | "friend"
      //   | "typedef"
      //   | "constexpr"
      // decl-specifier-seq = decl-specifier attribute-specifier-seq ?
      //   | decl-specifier decl-specifier-seq
      // storage-class-specifier = "register"
      //   | "static"
      //   | "thread_local"
      //   | "extern"
      //   | "mutable"
      // function-specifier = "inline"
      //   | "virtual"
      //   | "explicit"
      // typedef-name = identifier
      // type-specifier = trailing-type-specifier
      //   | class-specifier
      //   | enum-specifier
      // trailing-type-specifier = simple-type-specifier
      //   | elaborated-type-specifier
      //   | typename-specifier
      //   | cv-qualifier
      // type-specifier-seq = type-specifier attribute-specifier-seq ?
      //   | type-specifier type-specifier-seq
      // trailing-type-specifier-seq = trailing-type-specifier attribute-specifier-seq ?
      //   | trailing-type-specifier trailing-type-specifier-seq
      // simple-type-specifier = nested-name-specifier ? type-name
      //   | nested-name-specifier "template" simple-template-id
      //   | "char"
      //   | "char16_t"
      //   | "char32_t"
      //   | "wchar_t"
      //   | "bool"
      //   | "short"
      //   | "int"
      //   | "long"
      //   | "signed"
      //   | "unsigned"
      //   | "float"
      //   | "double"
      //   | "void"
      //   | "auto"
      //   | decltype-specifier
      // type-name = class-name
      //   | enum-name
      //   | typedef-name
      //   | simple-template-id
      // decltype-specifier = "decltype" "(" expression ")"
      //   | "decltype" "(" "auto" ")"
      // elaborated-type-specifier = class-key attribute-specifier-seq ? nested-name-specifier ? identifier
      //   | class-key simple-template-id
      //   | class-key nested-name-specifier "template" ? simple-template-id
      //   | "enum" nested-name-specifier ? identifier
      // enum-name = identifier
      // enum-specifier = enum-head "{" enumerator-list ? "}"
      //   | enum-head "{" enumerator-list "," "}"
      // enum-head = enum-key attribute-specifier-seq ? identifier ? enum-base ?
      //   | enum-key attribute-specifier-seq ? nested-name-specifier identifier enum-base ?
      // opaque-enum-declaration = enum-key attribute-specifier-seq ? identifier enum-base ? ";"
      // enum-key = "enum"
      //   | "enum" "class"
      //   | "enum" "struct"
      // enum-base = ":" type-specifier-seq
      // enumerator-list = enumerator-definition
      //   | enumerator-list "," enumerator-definition
      // enumerator-definition = enumerator
      //   | enumerator "=" constant-expression
      // enumerator = identifier attribute-specifier-seq ?
      // namespace-name = identifier
      //   | namespace-alias
      // namespace-definition = named-namespace-definition
      //   | unnamed-namespace-definition nested-namespace-definition
      // named-namespace-definition = "inline" ? "namespace" attribute-specifier-seq ? identifier "{" namespace-body "}"
      // unnamed-namespace-definition = "inline" ? "namespace" attribute-specifier-seq ? "{" namespace-body "}"
      // nested-namespace-definition = "namespace" enclosing-namespace-specifier "::" identifier "{" namespace-body "}"
      // enclosing-namespace-specifier = identifier enclosing-namespace-specifier "::" identifier
      // namespace-body = declaration-seq ?
      // namespace-alias = identifier
      // namespace-alias-definition = "namespace" identifier "=" qualified-namespace-specifier ";"
      // qualified-namespace-specifier = nested-name-specifier ? namespace-name
      // using-declaration = "using" "typename" ? nested-name-specifier unqualified-id ";"
      // using-directive = attribute-specifier-seq ? "using" "namespace" nested-name-specifier ? namespace-name ";"
      // asm-definition = "asm" "(" string-literal ")" ";"
      // linkage-specification = "extern" string-literal "{" declaration-seq ? "}"
      //   | "extern" string-literal declaration
      // attribute-specifier-seq = attribute-specifier-seq ? attribute-specifier
      // attribute-specifier = "[" "[" attribute-list "]" "]"
      //   | alignment-specifier
      // alignment-specifier = "alignas" "(" type-id "..." ? ")"
      //   | "alignas" "(" constant-expression "..." ? ")"
      // attribute-list = attribute ?
      //   | attribute-list "," attribute ?
      //   | attribute "..."
      //   | attribute-list "," attribute "..."
      // attribute = attribute-token attribute-argument-clause ?
      // attribute-token = identifier
      //   | attribute-scoped-token
      // attribute-scoped-token = attribute-namespace "::" identifier
      // attribute-namespace = identifier
      // attribute-argument-clause = "(" balanced-token-seq ")"
      // balanced-token-seq = balanced-token ?
      //   | balanced-token-seq balanced-token
      // balanced-token = "(" balanced-token-seq ")"
      //   | "[" balanced-token-seq "]"
      //   | "{" balanced-token-seq "}"
      //   | /[^\\(\\)\\{\\}\\[\\]]/
      //
      // init-declarator-list = init-declarator
      //   | init-declarator-list "," init-declarator
      // init-declarator = declarator initializer ?
      // declarator = ptr-declarator
      //   | noptr-declarator parameters-and-qualifiers trailing-return-type
      // ptr-declarator = noptr-declarator
      //   | ptr-operator ptr-declarator
      // noptr-declarator = declarator-id attribute-specifier-seq ?
      //   | noptr-declarator parameters-and-qualifiers
      //   | noptr-declarator "[" constant-expression ? "]" attribute-specifier-seq ?
      //   | "(" ptr-declarator ")"
      // parameters-and-qualifiers = "(" parameter-declaration-clause ")" cv-qualifier-seq ? ref-qualifier ? exception-specification ? attribute-specifier-seq ?
      // trailing-return-type = "->" trailing-type-specifier-seq abstract-declarator ?
      // ptr-operator = "*" attribute-specifier-seq ? cv-qualifier-seq ?
      //   | "&" attribute-specifier-seq ?
      //   | "&&" attribute-specifier-seq ?
      //   | nested-name-specifier "*" attribute-specifier-seq ? cv-qualifier-seq ?
      // cv-qualifier-seq = cv-qualifier cv-qualifier-seq ?
      // cv-qualifier = "const" | "volatile"
      // ref-qualifier = "&" | "&&"
      // declarator-id = "..." ? id-expression
      // type-id = type-specifier-seq abstract-declarator ?
      // abstract-declarator = ptr-abstract-declarator
      //   | noptr-abstract-declarator ? parameters-and-qualifiers trailing-return-type
      //   | abstract-pack-declarator
      // ptr-abstract-declarator = noptr-abstract-declarator
      //   | ptr-operator ptr-abstract-declarator ?
      // noptr-abstract-declarator = noptr-abstract-declarator ? parameters-and-qualifiers
      //   | noptr-abstract-declarator ? "[" constant-expression ? "]" attribute-specifier-seq ?
      //   | "(" ptr-abstract-declarator ")"
      // abstract-pack-declarator = noptr-abstract-pack-declarator
      //   | ptr-operator abstract-pack-declarator
      // noptr-abstract-pack-declarator = noptr-abstract-pack-declarator parameters-and-qualifiers
      //   | noptr-abstract-pack-declarator "[" constant-expression ? "]" attribute-specifier-seq ?
      //   | "..."
      // parameter-declaration-clause = parameter-declaration-list ? "..." ?
      //   | parameter-declaration-list "," "..."
      // parameter-declaration-list = parameter-declaration
      //   | parameter-declaration-list "," parameter-declaration
      // parameter-declaration = attribute-specifier-seq ? decl-specifier-seq declarator
      //   | attribute-specifier-seq ? decl-specifier-seq declarator "=" initializer-clause
      //   | attribute-specifier-seq ? decl-specifier-seq abstract-declarator ?
      //   | attribute-specifier-seq ? decl-specifier-seq abstract-declarator ? "=" initializer-clause
      // function-definition = attribute-specifier-seq ? decl-specifier-seq ? declarator virt-specifier-seq ? function-body
      // function-body = ctor-initializer ? compound-statement
      //   | function-try-block
      //   | "=" "default" ";"
      //   | "=" "delete" ";"
      // initializer = brace-or-equal-initializer
      //   | "(" expression-list ")"
      // brace-or-equal-initializer = "=" initializer-clause
      //   | braced-init-list
      // initializer-clause = assignment-expression
      //   | braced-init-list
      // initializer-list = initializer-clause "..." ?
      //   | initializer-list "," initializer-clause "..." ?
      // braced-init-list = "{" initializer-list "," ? "}" | "{" "}"
      //
      // class-name = identifier
      //   | simple-template-id
      // class-specifier = class-head "{" member-specification ? "}"
      // class-head = class-key attribute-specifier-seq ? class-head-name class-virt-specifier ? base-clause ?
      //   | class-key attribute-specifier-seq ? base-clause ?
      // class-head-name = nested-name-specifier ? class-name
      // class-virt-specifier = "final"
      // class-key = "class" | "struct" | "union"
      // member-specification = member-declaration member-specification ?
      //   | access-specifier ":" member-specification ?
      // member-declaration = attribute-specifier-seq ? decl-specifier-seq ? member-declarator-list ? ";"
      //   | function-definition
      //   | using-declaration
      //   | static_assert-declaration
      //   | template-declaration
      //   | alias-declaration
      //   | empty-declaration
      // member-declarator-list = member-declarator
      //   | member-declarator-list "," member-declarator
      // member-declarator = declarator virt-specifier-seq ? pure-specifier ?
      //   | declarator brace-or-equal-initializer ?
      //   | identifier ? attribute-specifier-seq ? ":" constant-expression
      // virt-specifier-seq = virt-specifier
      //   | virt-specifier-seq virt-specifier
      // virt-specifier = "override" | "final"
      // pure-specifier = "=" "0"
      //
      // base-clause = ":" base-specifier-list
      // base-specifier-list = base-specifier "..." ?
      //   | base-specifier-list "," base-specifier "..." ?
      // base-specifier = attribute-specifier-seq ? base-type-specifier
      //   | attribute-specifier-seq ? "virtual" access-specifier ? base-type-specifier
      //   | attribute-specifier-seq ? access-specifier "virtual" ? base-type-specifier
      // class-or-decltype = nested-name-specifier ? class-name
      //   | decltype-specifier
      // base-type-specifier = class-or-decltype
      // access-specifier = "private" | "protected" | "public"
      //
      //
      // conversion-function-id = "operator" conversion-type-id
      // conversion-type-id = type-specifier-seq conversion-declarator ?
      // conversion-declarator = ptr-operator conversion-declarator ?
      // ctor-initializer = ":" mem-initializer-list
      // mem-initializer-list = mem-initializer "..." ?
      //   | mem-initializer-list "," mem-initializer "..." ?
      // mem-initializer = mem-initializer-id "(" expression-list ? ")"
      //   | mem-initializer-id braced-init-list
      // mem-initializer-id = class-or-decltype
      //   | identifier
      //
      // operator-function-id = "operator" operator
      // operator = "new" | "delete" | "new[]" | "delete[]" | "+" | "-" | "*" | "/"
      //   | "%" | "ˆ" | "&" | "|" | "~" | "!" | "=" | "<" | ">" | "+=" | "-="
      //   | "*=" | "/=" | "%=" | "ˆ=" | "&=" | "|=" | "<<" | ">>" | ">>=" | "<<="
      //   | "==" | "!=" | "<=" | ">=" | "&&" | "||" | "++" | "--" | "," | "->*"
      //   | "->" | "()" | "[]"
      // literal-operator-id = "operator" string-literal identifier
      //   | "operator" user-defined-string-literal
      //
      // template-declaration = "template" "<" template-parameter-list ">" declaration
      // template-parameter-list = template-parameter
      //   | template-parameter-list "," template-parameter
      // template-parameter = type-parameter
      //   | parameter-declaration
      // type-parameter = type-parameter-key "..." ? identifier ?
      //   | type-parameter-key identifier ? "=" type-id
      //   | "template" "<" template-parameter-list ">" type-parameter-key "..." ? identifier ?
      //   | "template" "<" template-parameter-list ">" type-parameter-key identifier ? "=" id-expression
      // type-parameter-key = "class" | "typename"
      // simple-template-id = template-name "<" template-argument-list ? ">"
      // template-id = simple-template-id
      //   | operator-function-id "<" template-argument-list ? ">"
      //   | literal-operator-id "<" template-argument-list ? ">"
      // template-name = identifier
      // template-argument-list = template-argument "..." ?
      //   | template-argument-list "," template-argument "..." ?
      // template-argument = constant-expression
      //   | type-id
      //   | id-expression
      // typename-specifier = "typename" nested-name-specifier identifier
      //   | "typename" nested-name-specifier "template" ? simple-template-id
      // explicit-instantiation = "extern" ? "template" declaration
      // explicit-specialization = "template" "<" ">" declaration
      //
      // try-block = "try" compound-statement handler-seq
      // function-try-block = "try" ctor-initializer ? compound-statement handler-seq
      // handler-seq = handler handler-seq ?
      // handler = "catch" "(" exception-declaration ")" compound-statement
      // exception-declaration = attribute-specifier-seq ? type-specifier-seq declarator
      //   | attribute-specifier-seq ? type-specifier-seq abstract-declarator ?
      //   | "..."
      // exception-specification = dynamic-exception-specification
      //   | noexcept-specification
      // dynamic-exception-specification = "throw" "(" type-id-list ? ")"
      // type-id-list = type-id "..." ?
      //   | type-id-list "," type-id "..." ?
      // noexcept-specification = "noexcept" "(" constant-expression ")"
      //   | "noexcept"
      //
      // preprocessing-file = group ?
      // group = group-part
      //   | group group-part
      // group-part = if-section
      //   | control-line
      //   | text-line
      //   | "#" non-directive
      // if-section = if-group elif-groups ? else-group ? endif-line
      // if-group = "#" "if" constant-expression /\\n/ group ?
      //   | "#" "ifdef" identifier /\\n/ group ?
      //   | "#" "ifndef" identifier /\\n/ group ?
      // elif-groups = elif-group
      //   | elif-groups elif-group
      // elif-group = "#" "elif" constant-expression /\\n/ group ?
      // else-group = "#" "else" /\\n/ group ?
      // endif-line = "#" "endif" /\\n/
      // control-line = "#" "include" pp-tokens /\\n/
      //   | "#" "define" identifier replacement-list /\\n/
      //   | "#" "define" identifier "(" identifier-list ? ")" replacement-list /\\n/
      //   | "#" "define" identifier "(" "..." ")" replacement-list /\\n/
      //   | "#" "define" identifier "(" identifier-list "," "..." ")" replacement-list /\\n/
      //   | "#" "undef" identifier /\\n/
      //   | "#" "line" pp-tokens /\\n/
      //   | "#" "error" pp-tokens ? /\\n/
      //   | "#" "pragma" pp-tokens ? /\\n/
      //   | "#" /\\n/
      // text-line = pp-tokens ? /\\n/
      // non-directive = pp-tokens /\\n/
      // identifier-list = identifier
      //   | identifier-list "," identifier
      // replacement-list = pp-tokens ?
      // pp-tokens = preprocessing-token
      //   | pp-tokens preprocessing-token

    `)

    fs.writeFile('cpp.parser', c.save(), () => {})

    return c
  }

  static fromSave() {
    const c = new CLang()
    c.load(fs.readFileSync('cpp.parser'))
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
      const trees = sppf.trees
      console.log(trees.length);
      writeGraph(sppf.root, 'cpp')

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
