; Builtin variables / Language keywords
((identifier) @variable.builtin
  (#eq? @variable.builtin "this"))

; Keywords
[
  "package"
  "import"
  "using"
  "class"
  "interface"
  "struct"
  "enum"
  "trait"
  "extension"
  "data"
  "func"
  "pulsar"
  "method"
  "let"
  "var"
  "get"
  "set"
  "for"
  "in"
  "return"
  "if"
  "else"
  "match"
  "new"
  "await"
  "async"
  "unsafe"
  "defer"
  "implements"
  "extends"
] @keyword

((identifier) @keyword
  (#any-of? @keyword
    "typealias"
    "while"
    "break"
    "continue"
    "try"
    "catch"
    "throw"
    "finally"
    "constructor"
    "open"
    "type"
    "as"
    "is"))

; Modifiers
[
  "public"
  "private"
  "protected"
  "internal"
  "static"
  "abstract"
  "final"
  "sealed"
  "override"
  "mut"
  "const"
] @keyword.modifier

; Booleans
[
  "true"
  "false"
] @boolean

(boolean) @boolean

; Comments
(line_comment) @comment
(block_comment) @comment

; Literals
(number) @number
(string) @string

; Compile decorator
(compile_decorator
  "@" @punctuation.special
  name: (identifier) @attribute)

; Function & Method declarations
(function_declaration
  name: (identifier) @function)

(pulsar_declaration
  name: (identifier) @function)

(method_declaration
  name: (identifier) @function.method)

; Inline member declarations (C#-style: 'public static string GetUser(...)')
(inline_member_declaration
  return_type: (_) @type
  name: (identifier) @function.method)

; Type declarations
(type_declaration
  name: (identifier) @type)

; Parameters & Variables
(parameter
  name: (identifier) @variable.parameter)

(property_declaration
  name: (identifier) @variable)

(for_statement
  variable: (identifier) @variable)

(receive_bind
  name: (identifier) @variable)

(lambda_parameter
  (identifier) @variable.parameter)

; Calls
(call_expression
  (qualified_identifier) @function.call)

(new_expression
  (qualified_identifier) @type)

; Types in type nodes and parameters
(type
  (qualified_identifier) @type)

(type_list
  (type) @type)

; Operators
[
  "+"
  "-"
  "*"
  "/"
  "%"
  "="
  "=="
  "!="
  "<"
  ">"
  "<="
  ">="
  "&&"
  "||"
  "!"
  "->"
  "~>"
  "<~"
  "=>"
  "??"
  "?."
  "?"
  "~"
  "&"
] @operator

; Punctuation
[
  "("
  ")"
  "{"
  "}"
] @punctuation.bracket

[
  ","
  "."
  ":"
] @punctuation.delimiter

