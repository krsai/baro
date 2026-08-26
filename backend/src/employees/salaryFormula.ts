export const SALARY_FORMULA_PARAMETERS = new Set([
  "GRADE_RATE", "TENURE_YEARS", "ACTUAL_WORKDAYS", "SCHEDULED_WORKDAYS",
  "WORK_HOURS", "OVERTIME_HOURS", "HOLIDAY_HOURS", "FULL_ATTENDANCE_FACTOR",
  "PRODUCTION_ALLOWANCE",
]);
const OPERATORS = new Set(["+", "-", "×", "÷", "(", ")"]);
const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "×": 2, "÷": 2 };

export const validateSalaryFormula = (value: unknown, category: string) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return false;
  const tokens = value.map(String);
  if (category === "INCENTIVE" && (tokens.length !== 1 || tokens[0] !== "PRODUCTION_ALLOWANCE")) return false;
  if (category !== "INCENTIVE" && tokens[0] !== "GRADE_RATE") return false;
  if (category !== "INCENTIVE" && tokens.includes("PRODUCTION_ALLOWANCE")) return false;
  let depth = 0;
  let expectOperand = true;
  for (const token of tokens) {
    const isConstant = /^CONST:(0|[1-9]\d*)(\.\d+)?$/.test(token);
    const isParameter = SALARY_FORMULA_PARAMETERS.has(token);
    if (expectOperand) {
      if (token === "(") { depth += 1; continue; }
      if (!isConstant && !isParameter) return false;
      expectOperand = false;
    } else {
      if (token === ")") { if (depth < 1) return false; depth -= 1; continue; }
      if (!OPERATORS.has(token) || token === "(") return false;
      expectOperand = true;
    }
  }
  return !expectOperand && depth === 0;
};

export const evaluateSalaryFormula = (formula: string[], parameters: Record<string, number>) => {
  if (!validateSalaryFormula(formula, formula[0] === "GRADE_RATE" ? "ALLOWANCE" : "INCENTIVE")) throw new Error("invalid salary formula");
  const output: string[] = [];
  const operators: string[] = [];
  for (const token of formula) {
    if (SALARY_FORMULA_PARAMETERS.has(token) || token.startsWith("CONST:")) output.push(token);
    else if (token === "(") operators.push(token);
    else if (token === ")") { while (operators.length && operators.at(-1) !== "(") output.push(operators.pop()!); operators.pop(); }
    else { while (operators.length && (PRECEDENCE[operators.at(-1)!] ?? -1) >= (PRECEDENCE[token] ?? -1)) output.push(operators.pop()!); operators.push(token); }
  }
  while (operators.length) output.push(operators.pop()!);
  const stack: number[] = [];
  for (const token of output) {
    if (SALARY_FORMULA_PARAMETERS.has(token)) {
      const value = Number(parameters[token]);
      if (!Number.isFinite(value)) throw new Error(`salary parameter ${token} is required`);
      stack.push(value);
    } else if (token.startsWith("CONST:")) stack.push(Number(token.slice(6)));
    else {
      const right = stack.pop(); const left = stack.pop();
      if (left === undefined || right === undefined) throw new Error("invalid salary formula");
      if (token === "+") stack.push(left + right);
      if (token === "-") stack.push(left - right);
      if (token === "×") stack.push(left * right);
      if (token === "÷") { if (right === 0) throw new Error("salary formula division by zero"); stack.push(left / right); }
    }
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) throw new Error("invalid salary formula result");
  return stack[0];
};
