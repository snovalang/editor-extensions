module.exports = grammar({
  name: "snovalang",

  extras: ($) => [/\s/, $.line_comment, $.block_comment],

  word: ($) => $.identifier,

  conflicts: ($) => [
    [$.lambda_parameter, $.qualified_identifier],
  ],

  rules: {
    source_file: ($) => repeat($._item),

    _item: ($) =>
      choice(
        $.package_declaration,
        $.import_declaration,
        $.type_declaration,
        $.function_declaration,
        $.method_declaration,
        $.inline_member_declaration,
        $.pulsar_declaration,
        $.statement,
      ),

    package_declaration: ($) => seq("package", $.qualified_identifier),

    import_declaration: ($) =>
      seq(choice("import", "using"), $.qualified_identifier),

    compile_decorator: ($) =>
      seq("@", field("name", $.identifier), optional($.argument_list)),

    type_declaration: ($) =>
      seq(
        repeat($.compile_decorator),
        repeat($.modifier),
        choice(
          "class",
          "interface",
          "struct",
          "enum",
          "trait",
          "extension",
          seq("data", "class"),
        ),
        field("name", $.identifier),
        optional($.generic_parameters),
        optional($.parameter_list),
        optional($.type_list),
        $.block,
      ),

    function_declaration: ($) =>
      prec.right(
        seq(
          repeat($.compile_decorator),
          repeat($.modifier),
          optional("async"),
          optional("unsafe"),
          "func",
          field("name", $.identifier),
          optional($.generic_parameters),
          $.parameter_list,
          optional(choice(seq(":", $.type), seq("->", $.type), seq("~>", $.type))),
          optional(choice($.block, seq("=", $.expression))),
        ),
      ),

    pulsar_declaration: ($) =>
      prec.right(
        seq(
          repeat($.compile_decorator),
          repeat($.modifier),
          "pulsar",
          "func",
          field("name", $.identifier),
          optional($.generic_parameters),
          $.parameter_list,
          optional(choice(seq(":", $.type), seq("->", $.type), seq("~>", $.type))),
          optional($.block),
        ),
      ),

    method_declaration: ($) =>
      prec.right(
        seq(
          repeat($.compile_decorator),
          repeat($.modifier),
          optional("async"),
          optional("unsafe"),
          "method",
          field("name", $.identifier),
          optional($.generic_parameters),
          $.parameter_list,
          optional(choice(seq(":", $.type), seq("->", $.type), seq("~>", $.type))),
          optional(choice($.block, seq("=", $.expression))),
        ),
      ),

    // Declarações estilo C#/Java: 'public static string GetUser(string id) { }'
    // Sem keyword func/method — return type antes do nome.
    inline_member_declaration: ($) =>
      prec.right(
        5,
        seq(
          repeat($.compile_decorator),
          repeat1($.modifier),
          optional("async"),
          optional("unsafe"),
          field("return_type", $.type),
          field("name", $.identifier),
          optional($.generic_parameters),
          $.parameter_list,
          optional(choice($.block, seq("=", $.expression))),
        ),
      ),


    property_declaration: ($) =>
      prec.right(
        seq(
          repeat($.compile_decorator),
          repeat($.modifier),
          choice("let", "var"),
          field("name", $.identifier),
          optional(seq(":", $.type)),
          optional(choice(seq("=", $.expression), $.property_accessors)),
        ),
      ),

    property_accessors: ($) => seq("{", repeat($.property_accessor), "}"),

    // { get; set; } and projections: get: (x) -> expr;
    property_accessor: ($) =>
      seq(
        choice("get", "set"),
        optional(
          seq(":", "(", optional(commaSep($.parameter)), ")", "->", $.expression),
        ),
        optional(choice(";", ",")),
      ),

    statement: ($) =>
      choice(
        $.property_declaration,
        $.receive_bind,
        $.for_statement,
        $.pulsar_statement,
        $.defer_statement,
        $.match_arm,
        $.assignment_statement,
        $.return_statement,
        $.if_statement,
        $.match_statement,
        $.expression,
        $.block,
      ),

    receive_bind: ($) =>
      prec.right(
        2,
        seq(
          field("name", $.identifier),
          optional(seq(",", commaSep1($.identifier))),
          "<~",
          $.expression,
        ),
      ),

    pulsar_statement: ($) =>
      prec(2, choice(seq("pulsar", $.call_expression), seq("pulsar", $.block))),

    defer_statement: ($) => seq("defer", $.expression),

    for_statement: ($) =>
      seq(
        "for",
        choice(
          seq(
            "(",
            choice("let", "var"),
            field("variable", $.identifier),
            choice("in", "<~"),
            $.expression,
            ")",
          ),
          seq(
            choice("let", "var"),
            field("variable", $.identifier),
            choice("in", "<~"),
            $.expression,
          ),
        ),
        $.block,
      ),

    return_statement: ($) => prec.right(seq("return", optional($.expression))),

    if_statement: ($) =>
      seq(
        "if",
        $.expression,
        $.block,
        optional(seq("else", choice($.block, $.if_statement))),
      ),

    match_statement: ($) => seq("match", $.expression, $.block),

    match_arm: ($) =>
      prec.right(
        3,
        seq(
          $.expression,
          optional(seq("if", $.expression)),
          choice("->", "=>"),
          choice($.expression, $.return_statement, $.block),
        ),
      ),

    parameter_list: ($) => seq("(", optional(commaSep($.parameter)), ")"),

    parameter: ($) =>
      seq(
        field("name", $.identifier),
        ":",
        field("type", $.type),
        optional(seq("=", $.expression)),
      ),

    type_list: ($) =>
      seq(choice(":", "implements", "extends"), commaSep1($.type)),

    type: ($) =>
      choice(
        $.reference_type,
        $.raw_pointer_type,
        $.nullable_type,
        $.generic_type,
        $.qualified_identifier,
      ),

    reference_type: ($) => seq("&", optional("mut"), $.type),
    raw_pointer_type: ($) => seq("*", choice("const", "mut"), $.type),
    nullable_type: ($) =>
      seq(choice($.generic_type, $.qualified_identifier), "?"),
    generic_type: ($) => seq($.qualified_identifier, $.generic_arguments),
    generic_parameters: ($) => seq("<", commaSep1($.identifier), ">"),
    generic_arguments: ($) => seq("<", commaSep1($.type), ">"),

    expression: ($) =>
      choice(
        $.binary_expression,
        $.unary_expression,
        $.parenthesized_expression,
        $.try_expression,
        $.lambda_expression,
        $.new_expression,
        $.await_expression,
        $.call_expression,
        $.qualified_identifier,
        $.number,
        $.string,
        $.boolean,
        $.borrow,
      ),

    new_expression: ($) =>
      prec(
        4,
        seq(
          "new",
          $.qualified_identifier,
          optional($.generic_arguments),
          $.argument_list,
        ),
      ),

    await_expression: ($) => prec.right(3, seq("await", $.expression)),

    call_expression: ($) =>
      prec(
        2,
        seq(
          $.qualified_identifier,
          optional($.generic_arguments),
          $.argument_list,
        ),
      ),

    lambda_expression: ($) =>
      seq($.lambda_parameter_list, "->", choice($.block, $.expression)),

    lambda_parameter_list: ($) =>
      seq("(", optional(commaSep($.lambda_parameter)), ")"),

    lambda_parameter: ($) => choice($.identifier, "_"),

    argument_list: ($) => seq("(", optional(commaSep($.expression)), ")"),

    assignment_statement: ($) =>
      prec.right(
        2,
        seq(
          choice($.qualified_identifier, $.call_expression),
          "=",
          $.expression,
        ),
      ),

    try_expression: ($) =>
      prec.left(2, seq(choice($.call_expression, $.qualified_identifier), "?")),

    binary_expression: ($) =>
      prec.left(
        1,
        seq(
          field("left", $.expression),
          field(
            "operator",
            choice(
              "+",
              "-",
              "*",
              "/",
              "%",
              "==",
              "!=",
              "<",
              ">",
              "<=",
              ">=",
              "&&",
              "||",
              "??",
            ),
          ),
          field("right", $.expression),
        ),
      ),

    unary_expression: ($) =>
      prec.right(
        5,
        seq(field("operator", choice("-", "!", "~")), field("operand", $.expression)),
      ),

    parenthesized_expression: ($) => seq("(", $.expression, ")"),

    borrow: ($) => seq("&", optional("mut"), $.identifier),

    boolean: (_) => choice("true", "false"),

    block: ($) => seq("{", repeat($._item), "}"),

    modifier: ($) =>
      choice(
        "public",
        "private",
        "protected",
        "internal",
        "static",
        "abstract",
        "final",
        "sealed",
        "override",
      ),

    qualified_identifier: ($) =>
      seq($.identifier, repeat(seq(choice(".", "?."), $.identifier))),

    identifier: (_) => /[A-Za-z_][A-Za-z0-9_]*/,

    number: (_) => /\d+(_\d+)*(\.\d+(_\d+)*)?([eE][+-]?\d+)?/,

    string: (_) => /"([^"\\]|\\.)*"/,

    line_comment: (_) => token(seq("//", /.*/)),

    block_comment: (_) => token(seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")),
  },
});

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)), optional(","));
}
