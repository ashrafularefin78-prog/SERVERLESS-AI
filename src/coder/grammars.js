// Grammars for languages highlight.js does not ship. Kept deliberately small:
// they only need to color keywords, types, strings, numbers, and comments.

export function zig(hljs) {
  return {
    name: "Zig",
    keywords: {
      $pattern: /[A-Za-z_]\w*/,
      keyword:
        "fn const var pub export extern inline comptime defer errdefer return if else while for switch break continue unreachable suspend resume async await nosuspend test usingnamespace and or orelse catch try struct enum union error packed align linksection callconv opaque",
      type: "i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f16 f32 f64 f128 bool void anyerror usize isize c_int comptime_int comptime_float type noreturn anytype",
      literal: "true false null undefined",
    },
    contains: [
      hljs.COMMENT("//", "$"),
      { className: "string", begin: /\\\\[^\n]*/ },
      hljs.QUOTE_STRING_MODE,
      hljs.APOS_STRING_MODE,
      { className: "built_in", begin: /@[A-Za-z_]\w*/ },
      { className: "number", begin: /\b(?:0x[0-9a-fA-F_]+|0b[01_]+|0o[0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)\b/ },
    ],
  };
}

export function solidity(hljs) {
  return {
    name: "Solidity",
    keywords: {
      $pattern: /[A-Za-z_]\w*/,
      keyword:
        "contract library interface is function modifier event emit constructor fallback receive returns return if else for while do break continue try catch revert require assert new delete mapping memory storage calldata payable public private internal external pure view virtual override abstract immutable constant unchecked assembly let using struct enum import from as error type this super",
      type: "address bool string bytes byte uint int uint8 uint16 uint32 uint64 uint128 uint256 int8 int16 int32 int64 int128 int256 bytes1 bytes2 bytes4 bytes8 bytes16 bytes32 fixed ufixed",
      literal: "true false wei gwei ether seconds minutes hours days weeks",
      built_in: "msg block tx abi keccak256 sha256 ripemd160 ecrecover addmod mulmod selfdestruct blockhash gasleft now",
    },
    contains: [
      hljs.COMMENT("///", "$"),
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      { className: "meta", begin: /\bpragma\s+solidity\b/, end: /;/ },
      hljs.QUOTE_STRING_MODE,
      hljs.APOS_STRING_MODE,
      { className: "number", begin: /\b(?:0x[0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/ },
      { className: "title", begin: /\b(?:contract|library|interface)\s+[A-Za-z_]\w*/ },
    ],
  };
}

export function abap(hljs) {
  return {
    name: "ABAP",
    case_insensitive: true,
    keywords: {
      $pattern: /[A-Za-z][\w-]*/,
      keyword:
        "REPORT DATA TYPES CONSTANTS FIELD-SYMBOLS TYPE TABLE OF REF TO LIKE VALUE BEGIN END STRUCTURE INCLUDE SELECTION-SCREEN PARAMETERS SELECT-OPTIONS SELECT FROM INTO WHERE APPEND LOOP AT ENDLOOP READ WITH KEY MODIFY DELETE INSERT CLEAR REFRESH FREE MOVE WRITE IF ELSEIF ELSE ENDIF CASE WHEN ENDCASE DO ENDDO WHILE ENDWHILE FORM ENDFORM FUNCTION ENDFUNCTION METHOD ENDMETHOD CLASS DEFINITION IMPLEMENTATION PUBLIC SECTION PROTECTED PRIVATE METHODS CALL PERFORM TRY CATCH ENDTRY RAISE EXCEPTION NEW CREATE OBJECT CONCATENATE SPLIT CONDENSE TRANSLATE SORT DESCRIBE ASSIGN UNASSIGN CHECK EXIT RETURN CONTINUE AUTHORITY-CHECK COMMIT WORK ROLLBACK",
      type: "abap_bool c n i p f d t x string xstring decfloat16 decfloat34",
      literal: "abap_true abap_false space",
    },
    contains: [
      { className: "comment", begin: /^\*/, end: /$/ },
      hljs.COMMENT(/"/, /$/),
      hljs.APOS_STRING_MODE,
      { className: "string", begin: /`/, end: /`/ },
      { className: "string", begin: /\|/, end: /\|/ },
      hljs.C_NUMBER_MODE,
    ],
  };
}

export function cobol(hljs) {
  return {
    name: "COBOL",
    case_insensitive: true,
    keywords: {
      $pattern: /[A-Za-z][\w-]*/,
      keyword:
        "ACCEPT ADD ALTER CALL CANCEL CLOSE COMPUTE CONTINUE DELETE DISPLAY DIVIDE ELSE EVALUATE EXIT GO GOBACK IF INITIALIZE INSPECT INVOKE MERGE MOVE MULTIPLY OPEN PERFORM READ RECEIVE RETURN REWRITE SEARCH SET SORT START STOP STRING SUBTRACT UNSTRING WRITE WHEN OTHER NOT ON SIZE ERROR END-ACCEPT END-ADD END-CALL END-COMPUTE END-DELETE END-DIVIDE END-EVALUATE END-IF END-MULTIPLY END-PERFORM END-READ END-RETURN END-REWRITE END-SEARCH END-START END-STRING END-SUBTRACT END-UNSTRING END-WRITE",
      literal: "ZERO ZEROS ZEROES SPACE SPACES HIGH-VALUE HIGH-VALUES LOW-VALUE LOW-VALUES NULL NULLS TRUE FALSE",
    },
    contains: [
      hljs.COMMENT(/\*>/, /$/),
      { className: "comment", begin: /^\s*\*/, end: /$/ },
      { className: "section", begin: /\b(?:IDENTIFICATION|ENVIRONMENT|DATA|PROCEDURE)\s+DIVISION\b/ },
      { className: "section", begin: /\b(?:FILE|WORKING-STORAGE|LOCAL-STORAGE|LINKAGE|CONFIGURATION|INPUT-OUTPUT)\s+SECTION\b/ },
      { className: "type", begin: /\b(?:PIC|PICTURE)(?:\s+IS)?\s+[SXP9AZV0-9()V.,+\-*BCRZ]+/ },
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      hljs.C_NUMBER_MODE,
    ],
  };
}

export function logo(hljs) {
  return {
    name: "Logo",
    case_insensitive: true,
    keywords: {
      $pattern: /[A-Za-z_][\w?]*/,
      keyword:
        "to end forward fd back bk right rt left lt penup pu pendown pd home clearscreen cs clean repeat for foreach while if ifelse stop output op make local name thing show print pr type label go throw catch setpensize setpencolor setpc setbackground setbg hideturtle ht showturtle st setxy setx sety setheading seth towards distance pos heading xcor ycor wait",
      literal: "true false",
    },
    contains: [
      hljs.COMMENT(/;/, /$/),
      { className: "variable", begin: /:[A-Za-z_]\w*/ },
      { className: "string", begin: /"[^\s[\]]*/ },
      { className: "title", begin: /\bto\s+[A-Za-z_]\w*/ },
      hljs.C_NUMBER_MODE,
    ],
  };
}