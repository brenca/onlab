const { Serializable } = require('./serializable')

class Lexer extends Serializable {
  constructor() {
    super()
    this.CLASSES = []
    this.CLASS_GROUPS = []
    this.STATE = Lexer.DefaultState
    this.STATEFUL = false
    this.skipWhitespace = true
    this.skipEOL = true

    this.addTokenClass(new Lexer.EOLTokenClass())
    this.addTokenClass(new Lexer.EOFTokenClass())
  }

  serialize() {
    return {
      classes: this.CLASSES,
      classGroups: this.CLASS_GROUPS,
      state: this.STATE,
      stateful: this.STATEFUL,
      skipWhitespace: this.skipWhitespace,
      skipEOL: this.skipEOL
    }
  }

  deserialize(object) {
    this.CLASSES = object.$data.classes
    this.CLASS_GROUPS = object.$data.classGroups
    this.STATE = object.$data.state
    this.STATEFUL = object.$data.stateful
    this.skipWhitespace = object.$data.skipWhitespace
    this.skipEOL = object.$data.skipEOL
  }

  get stateful() {
    return this.STATEFUL
  }

  set stateful(value) {
    if (value) {
      if (this.STATES === undefined) this.STATES = []
      if (this.STATE_TRANSITIONS === undefined) this.STATE_TRANSITIONS = []
    }
    this.STATEFUL = value
  }

  get state() {
    if (!this.stateful) throw Error('Lexer is not in stateful mode')
    return this.STATE
  }

  set state(value) {
    if (!this.stateful) throw Error('Lexer is not in stateful mode')
    let state = this.STATES.find(s => { s.name === value })
    if (state)
      this.STATE = state
    else throw TypeError('"' + value + '" is not a a valid state')
  }

  addState(name, strict = false) {
    if (name === null) return
    if (!this.stateful) throw Error('Lexer is not in stateful mode')

    if (name instanceof Lexer.State) {
      if (this.STATES.indexOf(name) < 0)
        this.STATES.push(name)
      return name
    } else {
      let state = this.STATES.find(s => { return s.name === name })
      if (state === undefined) {
        state = new Lexer.State(name, strict)
        this.STATES.push(state)
      }
      return state
    }
  }

  addStates(states) {
    states.forEach(st => { this.addState(st) })
  }

  _findState(name) {
    if (name instanceof Lexer.State) {
      if (name.equals(Lexer.AnyState) || name.equals(Lexer.DefaultState))
        return name
      return this.STATES.find(st => { return st.equals(name) })
    } else {
      let state = this.STATES.find(s => { return s.name === name })
      if (state !== undefined)
        return state
    }
  }

  addStateTransition(stateTransition) {
    if (!this.stateful) throw Error('Lexer is not in stateful mode')

    if (stateTransition instanceof Lexer.StateTransition) {
      let tc = this._findTokenClass(stateTransition.class)
      if (tc === undefined)
        throw ReferenceError('"' + stateTransition.class + '" is not a valid' +
                             ' Lexer.TokenClass name')
      stateTransition.class = tc
      stateTransition.checkFromTo(this)
      this.STATE_TRANSITIONS.push(stateTransition)
    } else if (stateTransition instanceof Lexer.GroupStateTransition) {
      let tcg = this._findTokenClassGroup(stateTransition.group)
      if (tcg === undefined)
        throw ReferenceError('"' + stateTransition.group + '" is not a valid' +
                             ' Lexer.TokenClassGroup name')
      stateTransition.group = tcg
      stateTransition.checkFromTo(this)
      this.STATE_TRANSITIONS.push(stateTransition)
    } else throw TypeError('"' + stateTransition +
                           '" is not a Lexer.StateTransition' +
                           ' or Lexer.GroupStateTransition')
  }

  addStateTransitions(stateTransitions) {
    stateTransitions.forEach(st => { this.addStateTransition(st) })
  }

  addTokenClass(tokenClass) {
    if (tokenClass instanceof Lexer.TokenClass)
      this.CLASSES.push(tokenClass)
    else throw TypeError('"' + tokenClass + '" is not a Lexer.TokenClass')

    if (tokenClass.state !== Lexer.DefaultState) {
      let st = this.addState(tokenClass.state)
      tokenClass.state = st
    }
  }

  addTokenClasses(tokenClasses) {
    tokenClasses.forEach(tc => { this.addTokenClass(tc) })
  }

  _findTokenClass(name) {
    return this.CLASSES.find(tc => { return tc.name === name })
  }

  addTokenClassGroup(tokenClassGroup) {
    if (tokenClassGroup instanceof Lexer.TokenClassGroup) {
      tokenClassGroup.map(cn => {
        let tc = this._findTokenClass(cn)
        if (tc === undefined)
          throw ReferenceError('"' + cn + '" is not a valid' +
                               ' Lexer.TokenClass name')
        return tc
      })
      this.CLASS_GROUPS.push(tokenClassGroup)
    } else
      throw TypeError('"' + tokenClass + '" is not a Lexer.TokenClassGroup')
  }

  addTokenClassGroups(tokenClassGroups) {
    tokenClassGroups.forEach(tcg => { this.addTokenClassGroup(tcg) })
  }

  _findTokenClassGroup(name) {
    return this.CLASS_GROUPS.find(tcg => { return tcg.name === name })
  }

  _processTokens(tokens) {
    let line = 0
    let char = 0
    let absolute = 0

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].class instanceof Lexer.EOLTokenClass) {
        tokens[i].position = {
          line: ++line,
          char: -1,
          absolute: absolute + tokens[i].skipped,
          length: tokens[i].length()
        }

        char = 0
      } else {
        tokens[i].position = {
          line,
          char: char + tokens[i].skipped,
          absolute: absolute + tokens[i].skipped,
          length: tokens[i].length()
        }

        char += tokens[i].length()
      }

      absolute += tokens[i].length()
    }

    return tokens
  }

  // This is the main function of the Lexer
  tokenize(str) {
    const original = new Lexer.Source(str)
    if (this.stateful) {
      // Sort transitions to prioritize group transitions
      this.STATE_TRANSITIONS = this.STATE_TRANSITIONS.sort((a, b) => {
        let x = (a instanceof Lexer.GroupStateTransition) ? 0 : 1
        let y = (b instanceof Lexer.GroupStateTransition) ? 0 : 1

        return x < y ? -1 : x > y ? 1 : 0
      })
    }

    const skipWhitespace = () => {
      const whitespace = ' \\f\\t\\v\\u00a0\\u1680\\u180e\\u2000-'
        + '\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff'
      const eol = '\\n\\r'

      let core = `${this.skipWhitespace ? whitespace : ''}`
        + `${this.skipEOL ? eol : ''}`

      if (!this.skipEOL && !this.skipWhitespace)
        return 0

      const originalLength = str.length
      str = str.replace(new RegExp(`^[${core}]+`), '')
      return originalLength - str.length
    }

    let tokens = []
    while (str !== undefined && str.length > 0) {
      let tl = tokens.length
      let skipped = skipWhitespace()

      this.CLASSES.some(c => {
        if ((!this.STATE.strict && c.state === Lexer.AnyState)
            || this.STATE === c.state) {
          let m = c.match(str)
          if (m.consumed !== false) {
            tokens.push(new Lexer.Token(original, skipped, m.consumed, c))
            str = m.rest

            // if we are in stateful mode, check transitions
            if (this.stateful) {
              this.STATE_TRANSITIONS.some(st => {
                let r = st.apply(c, this.STATE)
                if (r.result) {
                  this.STATE = this._findState(r.to)
                  return true
                }
              })
            }

            return true
          }
        }
      })

      // no tokens were added because none matched, tokenization failed
      if (tokens.length === tl && str.length > 0) {
        const processed = this._processTokens(tokens)
        const position = processed.length > 0 ?
          processed[processed.length - 1].position :
          {
            line: 0, char: 0, absolute: 0, length: 0
          }

        const delta = position.length + skipped
        position.char += delta
        position.absolute += delta
        position.length = str.length

        return {
          success: false,
          tokens: processed,
          rest: {
            skipped,
            value: str,
            position
          }
        }
      }
    }

    skipWhitespace()
    // we ran out of characters, everything is tokenized
    return {
      success: true,
      tokens: this._processTokens(tokens)
    }
  }
}
Serializable.registerSubclass(Lexer)

Lexer.State = class LexerState extends Serializable {
  constructor(name, strict = false) {
    super()
    this.name = name
    // strict state means don't match things that are assigned to AnyState
    this.strict = strict
  }

  serialize() {
    return {
      name: this.name,
      strict: this.strict
    }
  }

  deserialize(object) {
    this.name = object.$data.name
    this.strict = object.$data.strict
  }
}
Serializable.registerSubclass(Lexer.State)

// special state to assign tokens to which can match in any state
Lexer.AnyState = new Lexer.State('*')
// the starting state
Lexer.DefaultState = new Lexer.State(null)

// base class for common stuff
Lexer.StateTransitionBase =
    class LexerStateTransitionBase extends Serializable {
  constructor(from, to) {
    super()
    this.FROM = from
    this.TO = to
  }

  serialize() {
    return {
      from: this.FROM,
      to: this.TO
    }
  }

  deserialize(object) {
    this.FROM = object.$data.from
    this.TO = object.$data.to
  }

  // sanity check plus turning state names to actual states
  checkFromTo(lex) {
    const f = lex._findState(this.FROM)
    const t = lex._findState(this.TO)

    if (f !== undefined)
      this.FROM = f
    else throw TypeError('"' + f + '" is not a a valid state')

    if (t !== undefined)
      this.TO = t
    else throw TypeError('"' + t + '" is not a a valid state')
  }
}
Serializable.registerSubclass(Lexer.StateTransitionBase)

Lexer.StateTransition =
    class LexerStateTransition extends Lexer.StateTransitionBase {
  constructor(tokenClass, from, to) {
    super(from, to)
    this.TOKEN_CLASS = tokenClass
  }

  serialize() {
    return {
      from: this.FROM,
      to: this.TO,
      tokenClass: this.TOKEN_CLASS
    }
  }

  deserialize(object) {
    this.FROM = object.$data.from
    this.TO = object.$data.to
    this.TOKEN_CLASS = object.$data.tokenClass
  }

  get class() {
    return this.TOKEN_CLASS
  }

  set class(value) {
    this.TOKEN_CLASS = value
    // convert from default mode (only FROM is set)
    if (this.TO === undefined) {
      this.TO = this.FROM
      this.FROM = this.TOKEN_CLASS.state
    }
  }

  apply(tokenClass, from) {
    if (tokenClass === this.TOKEN_CLASS && from === this.FROM)
      return { result: true, to: this.TO }
    else
      return { result: false }
  }
}
Serializable.registerSubclass(Lexer.StateTransition)

Lexer.GroupStateTransition =
    class LexerGroupStateTransition extends Lexer.StateTransitionBase {
  constructor(tokenClassGroup, from, to) {
    super(from, to)
    this.TOKEN_CLASS_GROUP = tokenClassGroup
  }

  serialize() {
    return {
      from: this.FROM,
      to: this.TO,
      tokenClassGroup: this.TOKEN_CLASS_GROUP
    }
  }

  deserialize(object) {
    this.FROM = object.$data.from
    this.TO = object.$data.to
    this.TOKEN_CLASS_GROUP = object.$data.tokenClassGroup
  }

  get group() {
    return this.TOKEN_CLASS_GROUP
  }

  set group(value) {
    this.TOKEN_CLASS_GROUP = value
  }

  apply(tokenClass, from) {
    const classGroup = this.TOKEN_CLASS_GROUP.find(tokenClass)
    if (classGroup !== undefined && from === this.FROM) {
      return { result: true, to: this.TO }
    } else {
      return { result: false }
    }
  }
}
Serializable.registerSubclass(Lexer.GroupStateTransition)

Lexer.Source = class LexerSource extends Serializable {
  constructor(source) {
    super()
    this.value = source
  }

  serialize() {
    return {
      value: this.value
    }
  }

  deserialize(object) {
    this.value = object.$data.value
  }
}
Serializable.registerSubclass(Lexer.Source)

Lexer.Token = class LexerToken extends Serializable {
  constructor(source, skipped, value, c) {
    super()
    this.source = source
    this.skipped = skipped
    this.value = value
    this.class = c
  }

  serialize() {
    return {
      source: this.source,
      skipped: this.skipped,
      value: this.value,
      class: this.class
    }
  }

  deserialize(object) {
    this.source = object.$data.source
    this.skipped = object.$data.skipped
    this.value = object.$data.value
    this.class = object.$data.class
  }

  near(n = 10) {
    const rest = this.source.value
      .substring(this.position.absolute)
      .match(/^(.*)(\r?\n|$)/i)[1]
    const code = rest.substr(0, n)

    return code.length === n ? `${code}...` : code
  }

  length() {
    return this.skipped + this.value.length
  }

  toString() {
    return value
  }
}
Serializable.registerSubclass(Lexer.Token)

Lexer.TokenClass = class LexerTokenClass extends Serializable {
  constructor(name, regexp, state = Lexer.DefaultState) {
    super()
    // replace regexp with one that only matches at the beginning
    if (regexp instanceof RegExp)
      this.regexp = {
        source: regexp.source,
        flags: regexp.flags
      }
    else if (regexp === null || regexp === undefined)
      this.regexp = null
    else
      throw TypeError('"' + regexp + '" is not a RegExp')
    this.name = name
    this.state = state
  }

  serialize() {
    return {
      name: this.name,
      state: this.state,
      regexp: this.regexp
    }
  }

  deserialize(object) {
    this.name = object.$data.name
    this.state = object.$data.state
    this.regexp = object.$data.regexp
  }

  match(str) {
    // try to match the beginning of the string
    if (this.regexp === null) {
      return {
        consumed: false,
        rest: str
      }
    }

    const regexp = new RegExp('^' + this.regexp.source, this.regexp.flags)
    let m = regexp.exec(str)
    if (m === null) {
      return {
        consumed: false,
        rest: str
      }
    } else {
      return {
        consumed: m[0],
        rest: str.replace(regexp, '')
      }
    }
  }
}
Serializable.registerSubclass(Lexer.TokenClass)

// shorthand for end-of-line matching, always added
Lexer.EOLTokenClass = class LexerEOLTokenClass extends Lexer.TokenClass {
  constructor() {
    super('EOL', /\r?\n/)
  }
}
Serializable.registerSubclass(Lexer.EOLTokenClass)

// shorthand for end-of-file token
Lexer.EOFTokenClass = class LexerEOFTokenClass extends Lexer.TokenClass {
  constructor() {
    super('EOF', null)
  }
}
Serializable.registerSubclass(Lexer.EOFTokenClass)

// matches in any state
Lexer.StatelessTokenClass =
    class LexerStatelessTokenClass extends Lexer.TokenClass {
  constructor(name, regexp) {
    super(name, regexp, Lexer.AnyState)
  }
}
Serializable.registerSubclass(Lexer.StatelessTokenClass)

// container for classes
Lexer.TokenClassGroup = class LexerTokenClassGroup extends Serializable {
  constructor(name, classes) {
    super()
    this.name = name
    if(classes.constructor !== Array)
      throw TypeError('"' + classes + '" is not an Array')
    this.CLASSES = classes
  }

  serialize() {
    return {
      name: this.name,
      classes: this.CLASSES
    }
  }

  deserialize(object) {
    this.name = object.$data.name
    this.CLASSES = object.$data.classes
  }

  map(fn) {
    this.CLASSES = this.CLASSES.map(fn)
  }

  push(classname) {
    this.CLASSES.push(classname)
  }

  pop(classname) {
    this.CLASSES.pop(classname)
  }

  find(tokenClass) {
    return this.CLASSES.find(c => { return c === tokenClass })
  }
}
Serializable.registerSubclass(Lexer.TokenClassGroup)

module.exports = Lexer
