// Complete beginner programs for common chat requests. These are small,
// hand-written recipes: no model, no network, and no invented APIs.

import { expandShorthand, normalizeText } from "../understand.js";

interface LanguageMeta {
  name: string;
  fence: string;
  setup: string;
  commands: string[];
  runNote?: string;
}

interface ProgramOptions {
  decimal?: boolean;
}

export interface ProgramTask {
  id: string;
  options: ProgramOptions;
}

export interface ProgramLanguage {
  id: string;
  name?: string;
  fence?: string;
}

type ProgramBuilder = (options: ProgramOptions) => string;

export interface BasicProgram {
  languageId: string;
  languageName: string;
  fence: string;
  setup: string;
  commands: string[];
  runNote: string;
  description: string;
  code: string;
}

const LANGUAGE_META: Record<string, LanguageMeta> = {
  c: {
    name: "C",
    fence: "c",
    setup: "Save it as `program.c`, then compile and run:",
    commands: ["gcc program.c -o program", "./program"],
    runNote: "On Windows, run `program.exe` instead of `./program`.",
  },
  cpp: {
    name: "C++",
    fence: "cpp",
    setup: "Save it as `program.cpp`, then compile and run:",
    commands: ["g++ program.cpp -o program", "./program"],
    runNote: "On Windows, run `program.exe` instead of `./program`.",
  },
  java: {
    name: "Java",
    fence: "java",
    setup: "Save it as `Main.java`, then compile and run:",
    commands: ["javac Main.java", "java Main"],
  },
  csharp: {
    name: "C#",
    fence: "csharp",
    setup: "Save it as `Program.cs` in a .NET console project, then run:",
    commands: ["dotnet run"],
    runNote: "If you do not have a project yet, run `dotnet new console` first.",
  },
  python: {
    name: "Python",
    fence: "python",
    setup: "Save it as `program.py`, then run:",
    commands: ["python program.py"],
  },
  javascript: {
    name: "JavaScript",
    fence: "javascript",
    setup: "Save it as `program.js`, then run it with Node.js:",
    commands: ["node program.js"],
  },
  go: {
    name: "Go",
    fence: "go",
    setup: "Save it as `program.go`, then run:",
    commands: ["go run program.go"],
  },
};

export const SUPPORTED_PROGRAM_LANGUAGE_NAMES = "C, C++, Java, C#, Python, JavaScript, and Go";

const TASK_DESCRIPTIONS: Record<string, string> = {
  "hello-world": "prints Hello, World!",
  "sum-two": "asks for two numbers and prints their sum",
  "sum-n": "adds the numbers from 1 up to n",
  "sum-digits": "adds the digits of a number",
  "even-odd": "checks whether a number is even or odd",
  factorial: "calculates the factorial of a number",
  "multiplication-table": "prints the multiplication table for a number",
  "largest-three": "finds the largest of three numbers",
  "reverse-string": "reverses a string",
  "reverse-number": "reverses the digits of a number",
  "prime-check": "checks whether a number is prime",
  fibonacci: "prints the first n Fibonacci numbers",
  "swap-two": "swaps two numbers",
  "count-vowels": "counts the vowels in a string",
  palindrome: "checks whether a string is a palindrome",
  average: "calculates the average of n numbers",
  fizzbuzz: "prints FizzBuzz from 1 to n",
  "leap-year": "checks whether a year is a leap year",
};

function task(id: string, options: ProgramOptions = {}): ProgramTask {
  return { id, options };
}

export function findBasicProgramTask(prompt: string): ProgramTask | null {
  const text = expandShorthand(normalizeText(prompt || "")).toLowerCase();
  if (!text) return null;
  const decimal = /\b(?:decimal|decimals|float|floating|fraction|fractions|real numbers?)\b/.test(
    text,
  );

  if (/\bhello[\s,.-]*world\b/.test(text)) return task("hello-world");

  if (
    /\bsum\b[^.\n]{0,40}\b(?:of\s+)?(?:its\s+)?digits?\b|\bdigits?\b[^.\n]{0,40}\bsum\b/.test(text)
  ) {
    return task("sum-digits");
  }

  if (
    /\bsum\b[^.\n]{0,50}\b(?:first\s+(?:n|\d+)|1\s*(?:to|through)\s*(?:n|\d+)|natural\s+numbers?)\b/.test(
      text,
    ) ||
    /\b(?:first\s+(?:n|\d+)|1\s*(?:to|through)\s+(?:n|\d+))\b[^.\n]{0,50}\bsum\b/.test(text)
  ) {
    return task("sum-n");
  }

  if (/\bfactorial\b/.test(text)) return task("factorial");
  if (/\bfibonacci\b|\bfib\s+series\b|\bfib\b/.test(text)) return task("fibonacci");
  if (/\bpalindrom\w*\b/.test(text)) return task("palindrome");
  if (/\bprime\b/.test(text)) return task("prime-check");

  if (
    /\b(?:count|number|total)\b[^.\n]{0,30}\bvowels?\b/.test(text) ||
    /\bvowels?\b[^.\n]{0,30}\b(?:count|number|total)\b/.test(text)
  ) {
    return task("count-vowels");
  }

  if (/\bleap\s*year\b/.test(text)) return task("leap-year");
  if (/\bfizz\s*buzz\b/.test(text)) return task("fizzbuzz");
  if (/\b(?:multiplication\s+table|times\s+table|table\s+of)\b/.test(text)) {
    return task("multiplication-table");
  }
  if (
    /\bswap\b/.test(text) &&
    /\b(?:two|2)\b/.test(text) &&
    /\b(?:numbers?|integers?|values?|variables?)\b/.test(text)
  ) {
    return task("swap-two");
  }
  if (
    /\b(?:largest|greatest|biggest|maximum|max)\b/.test(text) &&
    /\b(?:three|3)\b/.test(text) &&
    /\bnumbers?\b/.test(text)
  ) {
    return task("largest-three");
  }

  if (/\breverse\b/.test(text)) {
    if (
      /\b(?:array|list|linked\s+list|stack|queue|tree|graph)\b/.test(text) &&
      !/\b(?:string|text|word)\b/.test(text)
    ) {
      return null;
    }
    if (
      /\b(?:number|integer|digits?)\b/.test(text) &&
      !/\b(?:string|text|word|sentence)\b/.test(text)
    ) {
      return task("reverse-number");
    }
    return task("reverse-string");
  }

  if (/\b(?:average|mean)\b/.test(text)) return task("average");
  if (/\b(?:even|odd)\b/.test(text)) return task("even-odd");

  if (/\b(?:sum|add|addition|total)\b/.test(text)) {
    if (
      /\b(?:array|list|elements?|n\s+numbers?|multiple\s+numbers?|numbers\s+entered|all\s+numbers)\b/.test(
        text,
      )
    ) {
      return null;
    }
    return task("sum-two", { decimal });
  }

  return null;
}

const C_PROGRAMS: Record<string, ProgramBuilder> = {
  "hello-world": () => String.raw`#include <stdio.h>

int main(void) {
    printf("Hello, World!\n");
    return 0;
}`,
  "sum-two": ({ decimal }) =>
    decimal
      ? String.raw`#include <stdio.h>

int main(void) {
    double a, b;

    printf("Enter two numbers: ");
    scanf("%lf %lf", &a, &b);
    printf("Sum = %.2f\n", a + b);
    return 0;
}`
      : String.raw`#include <stdio.h>

int main(void) {
    int a, b;

    printf("Enter two integers: ");
    scanf("%d %d", &a, &b);
    printf("Sum = %d\n", a + b);
    return 0;
}`,
  "sum-n": () => String.raw`#include <stdio.h>

int main(void) {
    int n;
    long long sum = 0;

    printf("Enter a positive integer: ");
    scanf("%d", &n);

    for (int i = 1; i <= n; i++) {
        sum += i;
    }

    printf("Sum from 1 to %d = %lld\n", n, sum);
    return 0;
}`,
  "sum-digits": () => String.raw`#include <stdio.h>

int main(void) {
    long long number;
    int sum = 0;

    printf("Enter an integer: ");
    scanf("%lld", &number);

    long long value = number < 0 ? -number : number;
    while (value > 0) {
        sum += (int)(value % 10);
        value /= 10;
    }

    printf("Sum of digits = %d\n", sum);
    return 0;
}`,
  "even-odd": () => String.raw`#include <stdio.h>

int main(void) {
    int number;

    printf("Enter an integer: ");
    scanf("%d", &number);

    if (number % 2 == 0) {
        printf("%d is even.\n", number);
    } else {
        printf("%d is odd.\n", number);
    }
    return 0;
}`,
  factorial: () => String.raw`#include <stdio.h>

int main(void) {
    int n;
    unsigned long long factorial = 1;

    printf("Enter a non-negative integer: ");
    scanf("%d", &n);

    if (n < 0) {
        printf("Factorial is not defined for negative numbers.\n");
        return 1;
    }

    for (int i = 2; i <= n; i++) {
        factorial *= (unsigned long long)i;
    }

    printf("Factorial of %d = %llu\n", n, factorial);
    return 0;
}`,
  "multiplication-table": () => String.raw`#include <stdio.h>

int main(void) {
    int number;

    printf("Enter an integer: ");
    scanf("%d", &number);

    for (int i = 1; i <= 10; i++) {
        printf("%d x %d = %d\n", number, i, number * i);
    }
    return 0;
}`,
  "largest-three": () => String.raw`#include <stdio.h>

int main(void) {
    int a, b, c;

    printf("Enter three integers: ");
    scanf("%d %d %d", &a, &b, &c);

    int largest = a;
    if (b > largest) largest = b;
    if (c > largest) largest = c;

    printf("Largest = %d\n", largest);
    return 0;
}`,
  "reverse-string": () => String.raw`#include <stdio.h>
#include <string.h>

int main(void) {
    char text[200];

    printf("Enter a string: ");
    if (fgets(text, sizeof(text), stdin) == NULL) {
        return 1;
    }
    text[strcspn(text, "\n")] = '\0';

    size_t length = strlen(text);
    for (size_t i = 0; i < length / 2; i++) {
        char temp = text[i];
        text[i] = text[length - 1 - i];
        text[length - 1 - i] = temp;
    }

    printf("Reversed: %s\n", text);
    return 0;
}`,
  "reverse-number": () => String.raw`#include <stdio.h>

int main(void) {
    long long number, reversed = 0;

    printf("Enter an integer: ");
    scanf("%lld", &number);

    long long value = number < 0 ? -number : number;
    while (value > 0) {
        reversed = reversed * 10 + value % 10;
        value /= 10;
    }

    printf("Reversed: %lld\n", number < 0 ? -reversed : reversed);
    return 0;
}`,
  "prime-check": () => String.raw`#include <stdio.h>
#include <stdbool.h>

int main(void) {
    int n;
    bool is_prime = true;

    printf("Enter an integer greater than 1: ");
    scanf("%d", &n);

    if (n < 2) {
        is_prime = false;
    } else {
        for (int i = 2; (long long)i * i <= n; i++) {
            if (n % i == 0) {
                is_prime = false;
                break;
            }
        }
    }

    printf("%d is %sprime.\n", n, is_prime ? "" : "not ");
    return 0;
}`,
  fibonacci: () => String.raw`#include <stdio.h>

int main(void) {
    int n;
    unsigned long long a = 0, b = 1;

    printf("How many terms? ");
    scanf("%d", &n);

    for (int i = 0; i < n; i++) {
        printf("%llu ", a);
        unsigned long long next = a + b;
        a = b;
        b = next;
    }

    printf("\n");
    return 0;
}`,
  "swap-two": () => String.raw`#include <stdio.h>

int main(void) {
    int a, b;

    printf("Enter two integers: ");
    scanf("%d %d", &a, &b);

    int temp = a;
    a = b;
    b = temp;

    printf("After swap: a = %d, b = %d\n", a, b);
    return 0;
}`,
  "count-vowels": () => String.raw`#include <stdio.h>
#include <ctype.h>

int main(void) {
    char text[200];
    int count = 0;

    printf("Enter a string: ");
    if (fgets(text, sizeof(text), stdin) == NULL) {
        return 1;
    }

    for (int i = 0; text[i] != '\0'; i++) {
        char c = (char)tolower((unsigned char)text[i]);
        if (c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u') {
            count++;
        }
    }

    printf("Vowels: %d\n", count);
    return 0;
}`,
  palindrome: () => String.raw`#include <stdio.h>
#include <string.h>
#include <ctype.h>

int main(void) {
    char text[200];

    printf("Enter a string: ");
    if (fgets(text, sizeof(text), stdin) == NULL) {
        return 1;
    }
    text[strcspn(text, "\n")] = '\0';

    int left = 0;
    int right = (int)strlen(text) - 1;
    int is_palindrome = 1;

    while (left < right) {
        while (left < right && !isalnum((unsigned char)text[left])) left++;
        while (left < right && !isalnum((unsigned char)text[right])) right--;

        if (tolower((unsigned char)text[left]) != tolower((unsigned char)text[right])) {
            is_palindrome = 0;
            break;
        }
        left++;
        right--;
    }

    printf("%s\n", is_palindrome ? "It is a palindrome." : "It is not a palindrome.");
    return 0;
}`,
  average: () => String.raw`#include <stdio.h>

int main(void) {
    int n;
    double sum = 0.0;

    printf("How many numbers? ");
    scanf("%d", &n);

    if (n <= 0) {
        printf("Enter at least one number.\n");
        return 1;
    }

    for (int i = 0; i < n; i++) {
        double value;
        printf("Number %d: ", i + 1);
        scanf("%lf", &value);
        sum += value;
    }

    printf("Average = %.2f\n", sum / n);
    return 0;
}`,
  fizzbuzz: () => String.raw`#include <stdio.h>

int main(void) {
    int n;

    printf("How many numbers? ");
    scanf("%d", &n);

    for (int i = 1; i <= n; i++) {
        if (i % 15 == 0) {
            printf("FizzBuzz\n");
        } else if (i % 3 == 0) {
            printf("Fizz\n");
        } else if (i % 5 == 0) {
            printf("Buzz\n");
        } else {
            printf("%d\n", i);
        }
    }
    return 0;
}`,
  "leap-year": () => String.raw`#include <stdio.h>

int main(void) {
    int year;

    printf("Enter a year: ");
    scanf("%d", &year);

    if ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) {
        printf("%d is a leap year.\n", year);
    } else {
        printf("%d is not a leap year.\n", year);
    }
    return 0;
}`,
};

const CPP_PROGRAMS: Record<string, ProgramBuilder> = {
  "hello-world": () => String.raw`#include <iostream>

int main() {
    std::cout << "Hello, World!\n";
    return 0;
}`,
  "sum-two": ({ decimal }) =>
    decimal
      ? String.raw`#include <iostream>

int main() {
    double a, b;

    std::cout << "Enter two numbers: ";
    std::cin >> a >> b;
    std::cout << "Sum = " << a + b << '\n';
    return 0;
}`
      : String.raw`#include <iostream>

int main() {
    int a, b;

    std::cout << "Enter two integers: ";
    std::cin >> a >> b;
    std::cout << "Sum = " << a + b << '\n';
    return 0;
}`,
  "sum-n": () => String.raw`#include <iostream>

int main() {
    int n;
    long long sum = 0;

    std::cout << "Enter a positive integer: ";
    std::cin >> n;

    for (int i = 1; i <= n; ++i) {
        sum += i;
    }

    std::cout << "Sum from 1 to " << n << " = " << sum << '\n';
    return 0;
}`,
  "sum-digits": () => String.raw`#include <iostream>

int main() {
    long long number;
    int sum = 0;

    std::cout << "Enter an integer: ";
    std::cin >> number;

    long long value = number < 0 ? -number : number;
    while (value > 0) {
        sum += static_cast<int>(value % 10);
        value /= 10;
    }

    std::cout << "Sum of digits = " << sum << '\n';
    return 0;
}`,
  "even-odd": () => String.raw`#include <iostream>

int main() {
    int number;

    std::cout << "Enter an integer: ";
    std::cin >> number;

    if (number % 2 == 0) {
        std::cout << number << " is even.\n";
    } else {
        std::cout << number << " is odd.\n";
    }
    return 0;
}`,
  factorial: () => String.raw`#include <iostream>

int main() {
    int n;
    unsigned long long factorial = 1;

    std::cout << "Enter a non-negative integer: ";
    std::cin >> n;

    if (n < 0) {
        std::cout << "Factorial is not defined for negative numbers.\n";
        return 1;
    }

    for (int i = 2; i <= n; ++i) {
        factorial *= static_cast<unsigned long long>(i);
    }

    std::cout << "Factorial of " << n << " = " << factorial << '\n';
    return 0;
}`,
  "multiplication-table": () => String.raw`#include <iostream>

int main() {
    int number;

    std::cout << "Enter an integer: ";
    std::cin >> number;

    for (int i = 1; i <= 10; ++i) {
        std::cout << number << " x " << i << " = " << number * i << '\n';
    }
    return 0;
}`,
  "largest-three": () => String.raw`#include <iostream>

int main() {
    int a, b, c;

    std::cout << "Enter three integers: ";
    std::cin >> a >> b >> c;

    int largest = a;
    if (b > largest) largest = b;
    if (c > largest) largest = c;

    std::cout << "Largest = " << largest << '\n';
    return 0;
}`,
  "reverse-string": () => String.raw`#include <algorithm>
#include <iostream>
#include <string>

int main() {
    std::string text;

    std::cout << "Enter a string: ";
    std::getline(std::cin, text);
    std::reverse(text.begin(), text.end());

    std::cout << "Reversed: " << text << '\n';
    return 0;
}`,
  "reverse-number": () => String.raw`#include <iostream>

int main() {
    long long number, reversed = 0;

    std::cout << "Enter an integer: ";
    std::cin >> number;

    long long value = number < 0 ? -number : number;
    while (value > 0) {
        reversed = reversed * 10 + value % 10;
        value /= 10;
    }

    std::cout << "Reversed: " << (number < 0 ? -reversed : reversed) << '\n';
    return 0;
}`,
  "prime-check": () => String.raw`#include <iostream>

int main() {
    int n;

    std::cout << "Enter an integer greater than 1: ";
    std::cin >> n;

    bool is_prime = n >= 2;
    for (int i = 2; static_cast<long long>(i) * i <= n; ++i) {
        if (n % i == 0) {
            is_prime = false;
            break;
        }
    }

    std::cout << n << " is " << (is_prime ? "" : "not ") << "prime.\n";
    return 0;
}`,
  fibonacci: () => String.raw`#include <iostream>

int main() {
    int n;
    unsigned long long a = 0, b = 1;

    std::cout << "How many terms? ";
    std::cin >> n;

    for (int i = 0; i < n; ++i) {
        std::cout << a << ' ';
        unsigned long long next = a + b;
        a = b;
        b = next;
    }

    std::cout << '\n';
    return 0;
}`,
  "swap-two": () => String.raw`#include <iostream>

int main() {
    int a, b;

    std::cout << "Enter two integers: ";
    std::cin >> a >> b;

    int temp = a;
    a = b;
    b = temp;

    std::cout << "After swap: a = " << a << ", b = " << b << '\n';
    return 0;
}`,
  "count-vowels": () => String.raw`#include <cctype>
#include <iostream>
#include <string>

int main() {
    std::string text;
    int count = 0;

    std::cout << "Enter a string: ";
    std::getline(std::cin, text);

    for (char ch : text) {
        char c = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
        if (c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u') {
            ++count;
        }
    }

    std::cout << "Vowels: " << count << '\n';
    return 0;
}`,
  palindrome: () => String.raw`#include <cctype>
#include <iostream>
#include <string>

int main() {
    std::string text;

    std::cout << "Enter a string: ";
    std::getline(std::cin, text);

    int left = 0;
    int right = static_cast<int>(text.size()) - 1;
    bool is_palindrome = true;

    while (left < right) {
        while (left < right && !std::isalnum(static_cast<unsigned char>(text[left]))) ++left;
        while (left < right && !std::isalnum(static_cast<unsigned char>(text[right]))) --right;

        if (std::tolower(static_cast<unsigned char>(text[left])) !=
            std::tolower(static_cast<unsigned char>(text[right]))) {
            is_palindrome = false;
            break;
        }
        ++left;
        --right;
    }

    std::cout << (is_palindrome ? "It is a palindrome." : "It is not a palindrome.") << '\n';
    return 0;
}`,
  average: () => String.raw`#include <iostream>

int main() {
    int n;
    double sum = 0.0;

    std::cout << "How many numbers? ";
    std::cin >> n;

    if (n <= 0) {
        std::cout << "Enter at least one number.\n";
        return 1;
    }

    for (int i = 0; i < n; ++i) {
        double value;
        std::cout << "Number " << i + 1 << ": ";
        std::cin >> value;
        sum += value;
    }

    std::cout << "Average = " << sum / n << '\n';
    return 0;
}`,
  fizzbuzz: () => String.raw`#include <iostream>

int main() {
    int n;

    std::cout << "How many numbers? ";
    std::cin >> n;

    for (int i = 1; i <= n; ++i) {
        if (i % 15 == 0) {
            std::cout << "FizzBuzz\n";
        } else if (i % 3 == 0) {
            std::cout << "Fizz\n";
        } else if (i % 5 == 0) {
            std::cout << "Buzz\n";
        } else {
            std::cout << i << '\n';
        }
    }
    return 0;
}`,
  "leap-year": () => String.raw`#include <iostream>

int main() {
    int year;

    std::cout << "Enter a year: ";
    std::cin >> year;

    if ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) {
        std::cout << year << " is a leap year.\n";
    } else {
        std::cout << year << " is not a leap year.\n";
    }
    return 0;
}`,
};

const JAVA_PROGRAMS: Record<string, ProgramBuilder> = {
  "hello-world": () => String.raw`public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
  "sum-two": ({ decimal }) =>
    decimal
      ? String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter two numbers: ");
        double a = scanner.nextDouble();
        double b = scanner.nextDouble();

        System.out.println("Sum = " + (a + b));
    }
}`
      : String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter two integers: ");
        int a = scanner.nextInt();
        int b = scanner.nextInt();

        System.out.println("Sum = " + (a + b));
    }
}`,
  "sum-n": () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        long sum = 0;

        System.out.print("Enter a positive integer: ");
        int n = scanner.nextInt();

        for (int i = 1; i <= n; i++) {
            sum += i;
        }

        System.out.println("Sum from 1 to " + n + " = " + sum);
    }
}`,
  "sum-digits": () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter an integer: ");
        long number = scanner.nextLong();
        long value = Math.abs(number);
        int sum = 0;

        while (value > 0) {
            sum += (int)(value % 10);
            value /= 10;
        }

        System.out.println("Sum of digits = " + sum);
    }
}`,
  "even-odd": () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter an integer: ");
        int number = scanner.nextInt();

        if (number % 2 == 0) {
            System.out.println(number + " is even.");
        } else {
            System.out.println(number + " is odd.");
        }
    }
}`,
  factorial: () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter a non-negative integer: ");
        int n = scanner.nextInt();

        if (n < 0) {
            System.out.println("Factorial is not defined for negative numbers.");
            return;
        }

        long factorial = 1;
        for (int i = 2; i <= n; i++) {
            factorial *= i;
        }

        System.out.println("Factorial of " + n + " = " + factorial);
    }
}`,
  "multiplication-table": () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter an integer: ");
        int number = scanner.nextInt();

        for (int i = 1; i <= 10; i++) {
            System.out.println(number + " x " + i + " = " + (number * i));
        }
    }
}`,
  "largest-three": () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter three integers: ");
        int a = scanner.nextInt();
        int b = scanner.nextInt();
        int c = scanner.nextInt();

        int largest = a;
        if (b > largest) largest = b;
        if (c > largest) largest = c;

        System.out.println("Largest = " + largest);
    }
}`,
  "reverse-string": () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter a string: ");
        String text = scanner.nextLine();
        String reversed = new StringBuilder(text).reverse().toString();

        System.out.println("Reversed: " + reversed);
    }
}`,
  "reverse-number": () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter an integer: ");
        long number = scanner.nextLong();
        long value = Math.abs(number);
        long reversed = 0;

        while (value > 0) {
            reversed = reversed * 10 + value % 10;
            value /= 10;
        }

        System.out.println("Reversed: " + (number < 0 ? -reversed : reversed));
    }
}`,
  "prime-check": () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter an integer greater than 1: ");
        int n = scanner.nextInt();
        boolean isPrime = n >= 2;

        for (int i = 2; (long)i * i <= n; i++) {
            if (n % i == 0) {
                isPrime = false;
                break;
            }
        }

        System.out.println(n + " is " + (isPrime ? "" : "not ") + "prime.");
    }
}`,
  fibonacci: () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("How many terms? ");
        int n = scanner.nextInt();
        long a = 0;
        long b = 1;

        for (int i = 0; i < n; i++) {
            System.out.print(a + " ");
            long next = a + b;
            a = b;
            b = next;
        }

        System.out.println();
    }
}`,
  "swap-two": () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter two integers: ");
        int a = scanner.nextInt();
        int b = scanner.nextInt();

        int temp = a;
        a = b;
        b = temp;

        System.out.println("After swap: a = " + a + ", b = " + b);
    }
}`,
  "count-vowels": () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        int count = 0;

        System.out.print("Enter a string: ");
        String text = scanner.nextLine();

        for (int i = 0; i < text.length(); i++) {
            char c = Character.toLowerCase(text.charAt(i));
            if (c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u') {
                count++;
            }
        }

        System.out.println("Vowels: " + count);
    }
}`,
  palindrome: () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter a string: ");
        String text = scanner.nextLine();
        String cleaned = text.toLowerCase().replaceAll("[^a-z0-9]", "");

        int left = 0;
        int right = cleaned.length() - 1;
        boolean isPalindrome = true;

        while (left < right) {
            if (cleaned.charAt(left) != cleaned.charAt(right)) {
                isPalindrome = false;
                break;
            }
            left++;
            right--;
        }

        System.out.println(isPalindrome ? "It is a palindrome." : "It is not a palindrome.");
    }
}`,
  average: () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("How many numbers? ");
        int n = scanner.nextInt();

        if (n <= 0) {
            System.out.println("Enter at least one number.");
            return;
        }

        double sum = 0.0;
        for (int i = 0; i < n; i++) {
            System.out.print("Number " + (i + 1) + ": ");
            sum += scanner.nextDouble();
        }

        System.out.println("Average = " + (sum / n));
    }
}`,
  fizzbuzz: () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("How many numbers? ");
        int n = scanner.nextInt();

        for (int i = 1; i <= n; i++) {
            if (i % 15 == 0) {
                System.out.println("FizzBuzz");
            } else if (i % 3 == 0) {
                System.out.println("Fizz");
            } else if (i % 5 == 0) {
                System.out.println("Buzz");
            } else {
                System.out.println(i);
            }
        }
    }
}`,
  "leap-year": () => String.raw`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter a year: ");
        int year = scanner.nextInt();

        boolean isLeap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
        System.out.println(year + (isLeap ? " is a leap year." : " is not a leap year."));
    }
}`,
};

const CSHARP_PROGRAMS: Record<string, ProgramBuilder> = {
  "hello-world": () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.WriteLine("Hello, World!");
    }
}`,
  "sum-two": ({ decimal }) =>
    decimal
      ? String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter first number: ");
        double a = double.Parse(Console.ReadLine() ?? "0");
        Console.Write("Enter second number: ");
        double b = double.Parse(Console.ReadLine() ?? "0");

        Console.WriteLine($"Sum = {a + b}");
    }
}`
      : String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter first integer: ");
        int a = int.Parse(Console.ReadLine() ?? "0");
        Console.Write("Enter second integer: ");
        int b = int.Parse(Console.ReadLine() ?? "0");

        Console.WriteLine($"Sum = {a + b}");
    }
}`,
  "sum-n": () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter a positive integer: ");
        int n = int.Parse(Console.ReadLine() ?? "0");
        long sum = 0;

        for (int i = 1; i <= n; i++)
        {
            sum += i;
        }

        Console.WriteLine($"Sum from 1 to {n} = {sum}");
    }
}`,
  "sum-digits": () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter an integer: ");
        long number = long.Parse(Console.ReadLine() ?? "0");
        long value = Math.Abs(number);
        int sum = 0;

        while (value > 0)
        {
            sum += (int)(value % 10);
            value /= 10;
        }

        Console.WriteLine($"Sum of digits = {sum}");
    }
}`,
  "even-odd": () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter an integer: ");
        int number = int.Parse(Console.ReadLine() ?? "0");

        if (number % 2 == 0)
        {
            Console.WriteLine($"{number} is even.");
        }
        else
        {
            Console.WriteLine($"{number} is odd.");
        }
    }
}`,
  factorial: () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter a non-negative integer: ");
        int n = int.Parse(Console.ReadLine() ?? "0");

        if (n < 0)
        {
            Console.WriteLine("Factorial is not defined for negative numbers.");
            return;
        }

        long factorial = 1;
        for (int i = 2; i <= n; i++)
        {
            factorial *= i;
        }

        Console.WriteLine($"Factorial of {n} = {factorial}");
    }
}`,
  "multiplication-table": () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter an integer: ");
        int number = int.Parse(Console.ReadLine() ?? "0");

        for (int i = 1; i <= 10; i++)
        {
            Console.WriteLine($"{number} x {i} = {number * i}");
        }
    }
}`,
  "largest-three": () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter first integer: ");
        int a = int.Parse(Console.ReadLine() ?? "0");
        Console.Write("Enter second integer: ");
        int b = int.Parse(Console.ReadLine() ?? "0");
        Console.Write("Enter third integer: ");
        int c = int.Parse(Console.ReadLine() ?? "0");

        int largest = a;
        if (b > largest) largest = b;
        if (c > largest) largest = c;

        Console.WriteLine($"Largest = {largest}");
    }
}`,
  "reverse-string": () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter a string: ");
        string text = Console.ReadLine() ?? "";
        char[] chars = text.ToCharArray();
        Array.Reverse(chars);

        Console.WriteLine("Reversed: " + new string(chars));
    }
}`,
  "reverse-number": () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter an integer: ");
        long number = long.Parse(Console.ReadLine() ?? "0");
        long value = Math.Abs(number);
        long reversedNumber = 0;

        while (value > 0)
        {
            reversedNumber = reversedNumber * 10 + value % 10;
            value /= 10;
        }

        Console.WriteLine($"Reversed: {(number < 0 ? -reversedNumber : reversedNumber)}");
    }
}`,
  "prime-check": () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter an integer greater than 1: ");
        int n = int.Parse(Console.ReadLine() ?? "0");
        bool isPrime = n >= 2;

        for (int i = 2; (long)i * i <= n; i++)
        {
            if (n % i == 0)
            {
                isPrime = false;
                break;
            }
        }

        Console.WriteLine($"{n} is {(isPrime ? "" : "not ")}prime.");
    }
}`,
  fibonacci: () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("How many terms? ");
        int n = int.Parse(Console.ReadLine() ?? "0");
        long a = 0;
        long b = 1;

        for (int i = 0; i < n; i++)
        {
            Console.Write(a + " ");
            long next = a + b;
            a = b;
            b = next;
        }

        Console.WriteLine();
    }
}`,
  "swap-two": () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter first integer: ");
        int a = int.Parse(Console.ReadLine() ?? "0");
        Console.Write("Enter second integer: ");
        int b = int.Parse(Console.ReadLine() ?? "0");

        int temp = a;
        a = b;
        b = temp;

        Console.WriteLine($"After swap: a = {a}, b = {b}");
    }
}`,
  "count-vowels": () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter a string: ");
        string text = Console.ReadLine() ?? "";
        int count = 0;

        foreach (char ch in text)
        {
            char c = char.ToLowerInvariant(ch);
            if (c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u')
            {
                count++;
            }
        }

        Console.WriteLine($"Vowels: {count}");
    }
}`,
  palindrome: () => String.raw`using System;
using System.Linq;

class Program
{
    static void Main()
    {
        Console.Write("Enter a string: ");
        string text = Console.ReadLine() ?? "";
        string cleaned = new string(text.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();

        int left = 0;
        int right = cleaned.Length - 1;
        bool isPalindrome = true;

        while (left < right)
        {
            if (cleaned[left] != cleaned[right])
            {
                isPalindrome = false;
                break;
            }
            left++;
            right--;
        }

        Console.WriteLine(isPalindrome ? "It is a palindrome." : "It is not a palindrome.");
    }
}`,
  average: () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("How many numbers? ");
        int n = int.Parse(Console.ReadLine() ?? "0");

        if (n <= 0)
        {
            Console.WriteLine("Enter at least one number.");
            return;
        }

        double sum = 0.0;
        for (int i = 0; i < n; i++)
        {
            Console.Write($"Number {i + 1}: ");
            sum += double.Parse(Console.ReadLine() ?? "0");
        }

        Console.WriteLine($"Average = {sum / n}");
    }
}`,
  fizzbuzz: () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("How many numbers? ");
        int n = int.Parse(Console.ReadLine() ?? "0");

        for (int i = 1; i <= n; i++)
        {
            if (i % 15 == 0)
            {
                Console.WriteLine("FizzBuzz");
            }
            else if (i % 3 == 0)
            {
                Console.WriteLine("Fizz");
            }
            else if (i % 5 == 0)
            {
                Console.WriteLine("Buzz");
            }
            else
            {
                Console.WriteLine(i);
            }
        }
    }
}`,
  "leap-year": () => String.raw`using System;

class Program
{
    static void Main()
    {
        Console.Write("Enter a year: ");
        int year = int.Parse(Console.ReadLine() ?? "0");

        bool isLeap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
        Console.WriteLine($"{year} is {(isLeap ? "a leap year" : "not a leap year")}.");
    }
}`,
};

const PYTHON_PROGRAMS: Record<string, ProgramBuilder> = {
  "hello-world": () => String.raw`print("Hello, World!")`,
  "sum-two": ({ decimal }) =>
    decimal
      ? String.raw`a = float(input("Enter first number: "))
b = float(input("Enter second number: "))

print(f"Sum = {a + b}")`
      : String.raw`a = int(input("Enter first integer: "))
b = int(input("Enter second integer: "))

print(f"Sum = {a + b}")`,
  "sum-n": () => String.raw`n = int(input("Enter a positive integer: "))
total = 0

for i in range(1, n + 1):
    total += i

print(f"Sum from 1 to {n} = {total}")`,
  "sum-digits": () => String.raw`number = int(input("Enter an integer: "))
value = abs(number)
total = 0

while value > 0:
    total += value % 10
    value //= 10

print(f"Sum of digits = {total}")`,
  "even-odd": () => String.raw`number = int(input("Enter an integer: "))

if number % 2 == 0:
    print(f"{number} is even.")
else:
    print(f"{number} is odd.")`,
  factorial: () => String.raw`n = int(input("Enter a non-negative integer: "))

if n < 0:
    print("Factorial is not defined for negative numbers.")
else:
    factorial = 1
    for i in range(2, n + 1):
        factorial *= i
    print(f"Factorial of {n} = {factorial}")`,
  "multiplication-table": () => String.raw`number = int(input("Enter an integer: "))

for i in range(1, 11):
    print(f"{number} x {i} = {number * i}")`,
  "largest-three": () => String.raw`a = int(input("Enter first integer: "))
b = int(input("Enter second integer: "))
c = int(input("Enter third integer: "))

largest = max(a, b, c)
print(f"Largest = {largest}")`,
  "reverse-string": () => String.raw`text = input("Enter a string: ")
print(f"Reversed: {text[::-1]}")`,
  "reverse-number": () => String.raw`number = int(input("Enter an integer: "))
value = abs(number)
reversed_number = 0

while value > 0:
    reversed_number = reversed_number * 10 + value % 10
    value //= 10

print(f"Reversed: {-reversed_number if number < 0 else reversed_number}")`,
  "prime-check": () => String.raw`n = int(input("Enter an integer greater than 1: "))
is_prime = n >= 2

for i in range(2, int(n ** 0.5) + 1):
    if n % i == 0:
        is_prime = False
        break

print(f"{n} is {'prime' if is_prime else 'not prime'}.")`,
  fibonacci: () => String.raw`n = int(input("How many terms? "))
a, b = 0, 1

for _ in range(n):
    print(a, end=" ")
    a, b = b, a + b

print()`,
  "swap-two": () => String.raw`a = int(input("Enter first integer: "))
b = int(input("Enter second integer: "))

a, b = b, a
print(f"After swap: a = {a}, b = {b}")`,
  "count-vowels": () => String.raw`text = input("Enter a string: ").lower()
count = sum(1 for ch in text if ch in "aeiou")

print(f"Vowels: {count}")`,
  palindrome: () => String.raw`text = input("Enter a string: ").lower()
cleaned = "".join(ch for ch in text if ch.isalnum())

if cleaned == cleaned[::-1]:
    print("It is a palindrome.")
else:
    print("It is not a palindrome.")`,
  average: () => String.raw`n = int(input("How many numbers? "))

if n <= 0:
    print("Enter at least one number.")
else:
    total = 0.0
    for i in range(n):
        total += float(input(f"Number {i + 1}: "))
    print(f"Average = {total / n:.2f}")`,
  fizzbuzz: () => String.raw`n = int(input("How many numbers? "))

for i in range(1, n + 1):
    if i % 15 == 0:
        print("FizzBuzz")
    elif i % 3 == 0:
        print("Fizz")
    elif i % 5 == 0:
        print("Buzz")
    else:
        print(i)`,
  "leap-year": () => String.raw`year = int(input("Enter a year: "))

if (year % 4 == 0 and year % 100 != 0) or year % 400 == 0:
    print(f"{year} is a leap year.")
else:
    print(f"{year} is not a leap year.")`,
};

const JAVASCRIPT_PROGRAMS: Record<string, ProgramBuilder> = {
  "hello-world": () => String.raw`console.log("Hello, World!");`,
  "sum-two": ({ decimal }) =>
    decimal
      ? String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const a = Number(await rl.question("Enter first number: "));
  const b = Number(await rl.question("Enter second number: "));
  rl.close();

  console.log("Sum = " + (a + b));
})();`
      : String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const a = Number.parseInt(await rl.question("Enter first integer: "), 10);
  const b = Number.parseInt(await rl.question("Enter second integer: "), 10);
  rl.close();

  console.log("Sum = " + (a + b));
})();`,
  "sum-n": () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const n = Number.parseInt(await rl.question("Enter a positive integer: "), 10);
  rl.close();

  let total = 0;
  for (let i = 1; i <= n; i++) {
    total += i;
  }

  console.log("Sum from 1 to " + n + " = " + total);
})();`,
  "sum-digits": () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const number = Number.parseInt(await rl.question("Enter an integer: "), 10);
  rl.close();

  let value = Math.abs(number);
  let total = 0;
  while (value > 0) {
    total += value % 10;
    value = Math.trunc(value / 10);
  }

  console.log("Sum of digits = " + total);
})();`,
  "even-odd": () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const number = Number.parseInt(await rl.question("Enter an integer: "), 10);
  rl.close();

  if (number % 2 === 0) {
    console.log(number + " is even.");
  } else {
    console.log(number + " is odd.");
  }
})();`,
  factorial: () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const n = Number.parseInt(await rl.question("Enter a non-negative integer: "), 10);
  rl.close();

  if (n < 0) {
    console.log("Factorial is not defined for negative numbers.");
    return;
  }

  let factorial = 1;
  for (let i = 2; i <= n; i++) {
    factorial *= i;
  }

  console.log("Factorial of " + n + " = " + factorial);
})();`,
  "multiplication-table": () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const number = Number.parseInt(await rl.question("Enter an integer: "), 10);
  rl.close();

  for (let i = 1; i <= 10; i++) {
    console.log(number + " x " + i + " = " + number * i);
  }
})();`,
  "largest-three": () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const a = Number.parseInt(await rl.question("Enter first integer: "), 10);
  const b = Number.parseInt(await rl.question("Enter second integer: "), 10);
  const c = Number.parseInt(await rl.question("Enter third integer: "), 10);
  rl.close();

  console.log("Largest = " + Math.max(a, b, c));
})();`,
  "reverse-string": () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const text = await rl.question("Enter a string: ");
  rl.close();

  console.log("Reversed: " + [...text].reverse().join(""));
})();`,
  "reverse-number": () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const number = Number.parseInt(await rl.question("Enter an integer: "), 10);
  rl.close();

  let value = Math.abs(number);
  let reversed = 0;
  while (value > 0) {
    reversed = reversed * 10 + (value % 10);
    value = Math.trunc(value / 10);
  }

  console.log("Reversed: " + (number < 0 ? -reversed : reversed));
})();`,
  "prime-check": () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const n = Number.parseInt(await rl.question("Enter an integer greater than 1: "), 10);
  rl.close();

  let isPrime = n >= 2;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) {
      isPrime = false;
      break;
    }
  }

  console.log(n + " is " + (isPrime ? "prime." : "not prime."));
})();`,
  fibonacci: () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const n = Number.parseInt(await rl.question("How many terms? "), 10);
  rl.close();

  let a = 0;
  let b = 1;
  for (let i = 0; i < n; i++) {
    process.stdout.write(a + " ");
    const next = a + b;
    a = b;
    b = next;
  }
  process.stdout.write("\n");
})();`,
  "swap-two": () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  let a = Number.parseInt(await rl.question("Enter first integer: "), 10);
  let b = Number.parseInt(await rl.question("Enter second integer: "), 10);
  rl.close();

  [a, b] = [b, a];
  console.log("After swap: a = " + a + ", b = " + b);
})();`,
  "count-vowels": () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const text = (await rl.question("Enter a string: ")).toLowerCase();
  rl.close();

  const count = [...text].filter((ch) => "aeiou".includes(ch)).length;
  console.log("Vowels: " + count);
})();`,
  palindrome: () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const text = (await rl.question("Enter a string: ")).toLowerCase();
  rl.close();

  const cleaned = text.replace(/[^a-z0-9]/g, "");
  const isPalindrome = cleaned === [...cleaned].reverse().join("");
  console.log(isPalindrome ? "It is a palindrome." : "It is not a palindrome.");
})();`,
  average: () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const n = Number.parseInt(await rl.question("How many numbers? "), 10);

  if (n <= 0) {
    console.log("Enter at least one number.");
    rl.close();
    return;
  }

  let total = 0;
  for (let i = 0; i < n; i++) {
    total += Number(await rl.question("Number " + (i + 1) + ": "));
  }
  rl.close();

  console.log("Average = " + (total / n));
})();`,
  fizzbuzz: () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const n = Number.parseInt(await rl.question("How many numbers? "), 10);
  rl.close();

  for (let i = 1; i <= n; i++) {
    if (i % 15 === 0) {
      console.log("FizzBuzz");
    } else if (i % 3 === 0) {
      console.log("Fizz");
    } else if (i % 5 === 0) {
      console.log("Buzz");
    } else {
      console.log(i);
    }
  }
})();`,
  "leap-year": () => String.raw`const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const rl = readline.createInterface({ input, output });

(async () => {
  const year = Number.parseInt(await rl.question("Enter a year: "), 10);
  rl.close();

  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  console.log(year + (isLeap ? " is a leap year." : " is not a leap year."));
})();`,
};

const GO_PROGRAMS: Record<string, ProgramBuilder> = {
  "hello-world": () => String.raw`package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}`,
  "sum-two": ({ decimal }) =>
    decimal
      ? String.raw`package main

import "fmt"

func main() {
    var a, b float64

    fmt.Print("Enter two numbers: ")
    if _, err := fmt.Scan(&a, &b); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    fmt.Printf("Sum = %.2f\n", a+b)
}`
      : String.raw`package main

import "fmt"

func main() {
    var a, b int

    fmt.Print("Enter two integers: ")
    if _, err := fmt.Scan(&a, &b); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    fmt.Println("Sum =", a+b)
}`,
  "sum-n": () => String.raw`package main

import "fmt"

func main() {
    var n int
    var sum int64

    fmt.Print("Enter a positive integer: ")
    if _, err := fmt.Scan(&n); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    for i := 1; i <= n; i++ {
        sum += int64(i)
    }

    fmt.Printf("Sum from 1 to %d = %d\n", n, sum)
}`,
  "sum-digits": () => String.raw`package main

import "fmt"

func main() {
    var number int64

    fmt.Print("Enter an integer: ")
    if _, err := fmt.Scan(&number); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    value := number
    if value < 0 {
        value = -value
    }

    var sum int
    for value > 0 {
        sum += int(value % 10)
        value /= 10
    }

    fmt.Println("Sum of digits =", sum)
}`,
  "even-odd": () => String.raw`package main

import "fmt"

func main() {
    var number int

    fmt.Print("Enter an integer: ")
    if _, err := fmt.Scan(&number); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    if number%2 == 0 {
        fmt.Printf("%d is even.\n", number)
    } else {
        fmt.Printf("%d is odd.\n", number)
    }
}`,
  factorial: () => String.raw`package main

import "fmt"

func main() {
    var n int

    fmt.Print("Enter a non-negative integer: ")
    if _, err := fmt.Scan(&n); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    if n < 0 {
        fmt.Println("Factorial is not defined for negative numbers.")
        return
    }

    var factorial uint64 = 1
    for i := 2; i <= n; i++ {
        factorial *= uint64(i)
    }

    fmt.Printf("Factorial of %d = %d\n", n, factorial)
}`,
  "multiplication-table": () => String.raw`package main

import "fmt"

func main() {
    var number int

    fmt.Print("Enter an integer: ")
    if _, err := fmt.Scan(&number); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    for i := 1; i <= 10; i++ {
        fmt.Printf("%d x %d = %d\n", number, i, number*i)
    }
}`,
  "largest-three": () => String.raw`package main

import "fmt"

func main() {
    var a, b, c int

    fmt.Print("Enter three integers: ")
    if _, err := fmt.Scan(&a, &b, &c); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    largest := a
    if b > largest {
        largest = b
    }
    if c > largest {
        largest = c
    }

    fmt.Println("Largest =", largest)
}`,
  "reverse-string": () => String.raw`package main

import (
    "bufio"
    "fmt"
    "os"
    "strings"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    fmt.Print("Enter a string: ")
    text, _ := reader.ReadString('\n')
    text = strings.TrimSpace(text)

    runes := []rune(text)
    for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
        runes[i], runes[j] = runes[j], runes[i]
    }

    fmt.Println("Reversed:", string(runes))
}`,
  "reverse-number": () => String.raw`package main

import "fmt"

func main() {
    var number int64

    fmt.Print("Enter an integer: ")
    if _, err := fmt.Scan(&number); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    value := number
    if value < 0 {
        value = -value
    }

    var reversed int64
    for value > 0 {
        reversed = reversed*10 + value%10
        value /= 10
    }

    if number < 0 {
        reversed = -reversed
    }

    fmt.Println("Reversed:", reversed)
}`,
  "prime-check": () => String.raw`package main

import "fmt"

func main() {
    var n int64

    fmt.Print("Enter an integer greater than 1: ")
    if _, err := fmt.Scan(&n); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    isPrime := n >= 2
    for i := int64(2); i*i <= n; i++ {
        if n%i == 0 {
            isPrime = false
            break
        }
    }

    if isPrime {
        fmt.Printf("%d is prime.\n", n)
    } else {
        fmt.Printf("%d is not prime.\n", n)
    }
}`,
  fibonacci: () => String.raw`package main

import "fmt"

func main() {
    var n int

    fmt.Print("How many terms? ")
    if _, err := fmt.Scan(&n); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    var a, b uint64 = 0, 1
    for i := 0; i < n; i++ {
        fmt.Printf("%d ", a)
        a, b = b, a+b
    }
    fmt.Println()
}`,
  "swap-two": () => String.raw`package main

import "fmt"

func main() {
    var a, b int

    fmt.Print("Enter two integers: ")
    if _, err := fmt.Scan(&a, &b); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    a, b = b, a
    fmt.Printf("After swap: a = %d, b = %d\n", a, b)
}`,
  "count-vowels": () => String.raw`package main

import (
    "bufio"
    "fmt"
    "os"
    "strings"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    fmt.Print("Enter a string: ")
    text, _ := reader.ReadString('\n')
    text = strings.ToLower(strings.TrimSpace(text))

    count := 0
    for _, ch := range text {
        if strings.ContainsRune("aeiou", ch) {
            count++
        }
    }

    fmt.Println("Vowels:", count)
}`,
  palindrome: () => String.raw`package main

import (
    "bufio"
    "fmt"
    "os"
    "unicode"
)

func main() {
    reader := bufio.NewReader(os.Stdin)
    fmt.Print("Enter a string: ")
    text, _ := reader.ReadString('\n')

    var cleaned []rune
    for _, ch := range text {
        if unicode.IsLetter(ch) || unicode.IsDigit(ch) {
            cleaned = append(cleaned, unicode.ToLower(ch))
        }
    }

    isPalindrome := true
    for i, j := 0, len(cleaned)-1; i < j; i, j = i+1, j-1 {
        if cleaned[i] != cleaned[j] {
            isPalindrome = false
            break
        }
    }

    if isPalindrome {
        fmt.Println("It is a palindrome.")
    } else {
        fmt.Println("It is not a palindrome.")
    }
}`,
  average: () => String.raw`package main

import "fmt"

func main() {
    var n int

    fmt.Print("How many numbers? ")
    if _, err := fmt.Scan(&n); err != nil || n <= 0 {
        fmt.Println("Enter at least one number.")
        return
    }

    var sum float64
    for i := 0; i < n; i++ {
        var value float64
        fmt.Printf("Number %d: ", i+1)
        if _, err := fmt.Scan(&value); err != nil {
            fmt.Println("Invalid input.")
            return
        }
        sum += value
    }

    fmt.Printf("Average = %.2f\n", sum/float64(n))
}`,
  fizzbuzz: () => String.raw`package main

import "fmt"

func main() {
    var n int

    fmt.Print("How many numbers? ")
    if _, err := fmt.Scan(&n); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    for i := 1; i <= n; i++ {
        switch {
        case i%15 == 0:
            fmt.Println("FizzBuzz")
        case i%3 == 0:
            fmt.Println("Fizz")
        case i%5 == 0:
            fmt.Println("Buzz")
        default:
            fmt.Println(i)
        }
    }
}`,
  "leap-year": () => String.raw`package main

import "fmt"

func main() {
    var year int

    fmt.Print("Enter a year: ")
    if _, err := fmt.Scan(&year); err != nil {
        fmt.Println("Invalid input.")
        return
    }

    if (year%4 == 0 && year%100 != 0) || year%400 == 0 {
        fmt.Printf("%d is a leap year.\n", year)
    } else {
        fmt.Printf("%d is not a leap year.\n", year)
    }
}`,
};

const BASIC_PROGRAMS: Record<string, Record<string, ProgramBuilder>> = {
  c: C_PROGRAMS,
  cpp: CPP_PROGRAMS,
  java: JAVA_PROGRAMS,
  csharp: CSHARP_PROGRAMS,
  python: PYTHON_PROGRAMS,
  javascript: JAVASCRIPT_PROGRAMS,
  go: GO_PROGRAMS,
};

export function buildBasicProgram(
  prompt: string,
  language: ProgramLanguage | null | undefined,
  resolvedTask: ProgramTask | null = null,
): BasicProgram | null {
  if (!language) return null;
  const taskInfo = resolvedTask || findBasicProgramTask(prompt);
  if (!taskInfo) return null;

  const builders = BASIC_PROGRAMS[language.id];
  const meta = LANGUAGE_META[language.id];
  if (!builders || !meta) return null;

  const build = builders[taskInfo.id];
  if (!build) return null;

  const code = build(taskInfo.options || {}).trim();
  if (!code) return null;

  return {
    languageId: language.id,
    languageName: language.name || meta.name,
    fence: language.fence || meta.fence,
    setup: meta.setup,
    commands: meta.commands,
    runNote: meta.runNote || "",
    description: TASK_DESCRIPTIONS[taskInfo.id] ?? "",
    code,
  };
}

export function formatBasicProgram(
  program: BasicProgram,
  {
    coder = false,
    framework = null,
  }: { coder?: boolean; framework?: { name: string } | null } = {},
): string {
  const parts: string[] = [];

  if (coder) {
    const target = framework
      ? `**${program.languageName}** with **${framework.name}**`
      : `**${program.languageName}**`;
    parts.push(
      `**Built-in Coder.** Detected ${target}, task **Write code**. Here is a complete, runnable beginner example.`,
    );
  } else {
    parts.push(`Here is a complete ${program.languageName} program that ${program.description}.`);
  }

  if (framework) {
    parts.push(
      `This is plain ${program.languageName}; it does not include the ${framework.name} setup.`,
    );
  }

  parts.push("```" + program.fence + "\n" + program.code + "\n```");
  parts.push(`${program.setup}\n\n\`\`\`bash\n${program.commands.join("\n")}\n\`\`\``);

  if (program.runNote) parts.push(program.runNote);
  parts.push("The example assumes valid input; add checks if users may type something else.");

  return parts.join("\n\n");
}
