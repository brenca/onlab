const { Serializable } = require('./serializable')

class Lexer extends Serializable {
  constructor() {
    super()
    this._classes = []
    this._classGroups = []
    this._state = Lexer.DefaultState
    this._stateful = false
    this.skipWhitespace = true

    this.addTokenClass(new Lexer.EOLTokenClass())
    this.addTokenClass(new Lexer.EOFTokenClass())
  }

  get stateful() {
    return this._stateful
  }

  set stateful(value) {
    if (value) {
      if (this._states === undefined) this._states = []
      if (this._stateTransitions === undefined) this._stateTransitions = []
    }
    this._stateful = value
  }

  get state() {
    if (!this.stateful) throw Error('Lexer is not in stateful mode')
    return this._state
  }

  set state(value) {
    if (!this.stateful) throw Error('Lexer is not in stateful mode')
    let state = this._states.find(s => { s.name === value })
    if (state)
      this._state = state
    else throw TypeError('"' + value + '" is not a a valid state')
  }

  addState(name, strict = false) {
    if (name === null) return
    if (!this.stateful) throw Error('Lexer is not in stateful mode')

    if (name instanceof Lexer.State) {
      if (this._states.indexOf(name) < 0)
        this._states.push(name)
      return name
    } else {
      let state = this._states.find(s => { return s.name === name })
      if (state === undefined) {
        state = new Lexer.State(name, strict)
        this._states.push(state)
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
      return this._states.find(st => { return st.equals(name) })
    } else {
      let state = this._states.find(s => { return s.name === name })
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
      this._stateTransitions.push(stateTransition)
    } else if (stateTransition instanceof Lexer.GroupStateTransition) {
      let tcg = this._findTokenClassGroup(stateTransition.group)
      if (tcg === undefined)
        throw ReferenceError('"' + stateTransition.group + '" is not a valid' +
                             ' Lexer.TokenClassGroup name')
      stateTransition.group = tcg
      stateTransition.checkFromTo(this)
      this._stateTransitions.push(stateTransition)
    } else throw TypeError('"' + stateTransition +
                           '" is not a Lexer.StateTransition' +
                           ' or Lexer.GroupStateTransition')
  }

  addStateTransitions(stateTransitions) {
    stateTransitions.forEach(st => { this.addStateTransition(st) })
  }

  addTokenClass(tokenClass) {
    if (tokenClass instanceof Lexer.TokenClass)
      this._classes.push(tokenClass)
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
    return this._classes.find(tc => { return tc.name === name })
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
      this._classGroups.push(tokenClassGroup)
    } else
      throw TypeError('"' + tokenClass + '" is not a Lexer.TokenClassGroup')
  }

  addTokenClassGroups(tokenClassGroups) {
    tokenClassGroups.forEach(tcg => { this.addTokenClassGroup(tcg) })
  }

  _findTokenClassGroup(name) {
    return this._classGroups.find(tcg => { return tcg.name === name })
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
      this._stateTransitions = this._stateTransitions.sort((a, b) => {
        let x = (a instanceof Lexer.GroupStateTransition) ? 0 : 1
        let y = (b instanceof Lexer.GroupStateTransition) ? 0 : 1

        return x < y ? -1 : x > y ? 1 : 0
      })
    }

    const skipWhitespace = () => {
      const whitespaceRegExp = new RegExp('^[ \f\t\v\u00a0\u1680\u180e\u2000-'
        + '\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+')

      let originalLength = str.length
      if (this.skipWhitespace) str = str.replace(whitespaceRegExp, '')
      return originalLength - str.length
    }

    let tokens = []
    while (str !== undefined && str.length > 0) {
      let tl = tokens.length
      let skipped = skipWhitespace()

      this._classes.some(c => {
        if ((!this._state.strict && c.state === Lexer.AnyState)
            || this._state === c.state) {
          let m = c.match(str)
          if (m.consumed !== false) {
            tokens.push(new Lexer.Token(original, skipped, m.consumed, c))
            str = m.rest

            // if we are in stateful mode, check transitions
            if (this.stateful) {
              this._stateTransitions.some(st => {
                let r = st.apply(c, this._state)
                if (r.result) {
                  this._state = this._findState(r.to)
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
        const position = processed[processed.length - 1].position

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
    this._from = from
    this._to = to
  }

  // sanity check plus turning state names to actual states
  checkFromTo(lex) {
    let f = lex._findState(this._from)
    let t = lex._findState(this._to)

    if (f !== undefined)
      this._from = f
    else throw TypeError('"' + f + '" is not a a valid state')

    if (t !== undefined)
      this._to = t
    else throw TypeError('"' + t + '" is not a a valid state')
  }
}
Serializable.registerSubclass(Lexer.StateTransitionBase)

Lexer.StateTransition =
    class LexerStateTransition extends Lexer.StateTransitionBase {
  constructor(tokenClass, from, to) {
    super(from, to)
    this._tokenClass = tokenClass
  }

  get class() {
    return this._tokenClass
  }

  set class(value) {
    this._tokenClass = value
    // convert from default mode (only _from is set)
    if (this._to === undefined) {
      this._to = this._from
      this._from = this._tokenClass.state
    }
  }

  apply(tokenClass, from) {
    if (tokenClass === this._tokenClass && from === this._from)
      return { result: true, to: this._to }
    else
      return { result: false }
  }
}
Serializable.registerSubclass(Lexer.StateTransition)

Lexer.GroupStateTransition =
    class LexerGroupStateTransition extends Lexer.StateTransitionBase {
  constructor(tokenClassGroup, from, to) {
    super(from, to)
    this._tokenClassGroup = tokenClassGroup
  }

  get group() {
    return this._tokenClassGroup
  }

  set group(value) {
    this._tokenClassGroup = value
  }

  apply(tokenClass, from) {
    if (this._tokenClassGroup.find(tokenClass) !== undefined
        && from === this._from)
      return { result: true, to: this._to }
    else
      return { result: false }
  }
}
Serializable.registerSubclass(Lexer.GroupStateTransition)

Lexer.Source = class LexerSource extends Serializable {
  constructor(source) {
    super()
    this.value = source
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

  near(n = 10) {
    const rest = this.source.value
      .substring(this.position.absolute)
      .match(/^(.*)(\n|$)/i)[1]
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
    this._classes = classes
  }

  map(fn) {
    this._classes = this._classes.map(fn)
  }

  push(classname) {
    this._classes.push(classname)
  }

  pop(classname) {
    this._classes.pop(classname)
  }

  find(tokenClass) {
    return this._classes.find(c => { return c === tokenClass })
  }
}
Serializable.registerSubclass(Lexer.TokenClassGroup)

module.exports = Lexer
