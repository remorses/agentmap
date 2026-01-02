import { beforeAll, describe, expect, test } from 'bun:test'
import { parseCode, initParser } from '../parser/index.js'
import { extractDefinitions } from './definitions.js'
import type { Language, Definition } from '../types.js'

// ============================================================================
// Setup
// ============================================================================

beforeAll(async () => {
  await initParser()
})

/**
 * Helper to extract definitions from code string
 */
async function getDefinitions(code: string, language: Language): Promise<Definition[]> {
  const tree = await parseCode(code, language)
  return extractDefinitions(tree.rootNode, language)
}

// ============================================================================
// TypeScript Tests
// ============================================================================

describe('TypeScript', () => {
  test('large function (>7 lines) is included', async () => {
    const code = `function processData(input: string): string {
  const trimmed = input.trim()
  const upper = trimmed.toUpperCase()
  const parts = upper.split(',')
  const filtered = parts.filter(Boolean)
  const joined = filtered.join('-')
  const result = joined + '!'
  return result
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 9,
    "exported": false,
    "line": 1,
    "name": "processData",
    "type": "function",
  },
]
`)
  })

  test('small function (<=7 lines) is excluded', async () => {
    const code = `function add(a: number, b: number): number {
  return a + b
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('large class is included', async () => {
    const code = `class Calculator {
  private value: number = 0

  add(n: number): this {
    this.value += n
    return this
  }

  subtract(n: number): this {
    this.value -= n
    return this
  }
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 13,
    "exported": false,
    "line": 1,
    "name": "Calculator",
    "type": "class",
  },
]
`)
  })

  test('small class is excluded', async () => {
    const code = `class Point {
  x: number
  y: number
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('large arrow function is included', async () => {
    const code = `const processItems = (items: string[]) => {
  const result: string[] = []
  for (const item of items) {
    const processed = item.trim()
    const upper = processed.toUpperCase()
    result.push(upper)
  }
  return result
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 9,
    "exported": false,
    "line": 1,
    "name": "processItems",
    "type": "function",
  },
]
`)
  })

  test('small arrow function is excluded', async () => {
    const code = `const double = (n: number) => n * 2`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('exported const is included', async () => {
    const code = `export const CONFIG = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 4,
    "exported": true,
    "line": 1,
    "name": "CONFIG",
    "type": "const",
  },
]
`)
  })

  test('non-exported const is excluded', async () => {
    const code = `const CONFIG = { timeout: 5000 }`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('interface is included (any size)', async () => {
    const code = `interface User {
  name: string
  age: number
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 4,
    "exported": false,
    "line": 1,
    "name": "User",
    "type": "interface",
  },
]
`)
  })

  test('type alias is included (any size)', async () => {
    const code = `type Status = 'pending' | 'active' | 'done'`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 1,
    "exported": false,
    "line": 1,
    "name": "Status",
    "type": "type",
  },
]
`)
  })

  test('enum is included (any size)', async () => {
    const code = `enum Color {
  Red,
  Green,
  Blue,
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 5,
    "exported": false,
    "line": 1,
    "name": "Color",
    "type": "enum",
  },
]
`)
  })

  test('exported function', async () => {
    const code = `export function fetchData(url: string): Promise<Response> {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  const options = { method: 'GET', headers }
  const response = fetch(url, options)
  return response
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
      [
        {
          "endLine": 7,
          "exported": true,
          "line": 1,
          "name": "fetchData",
          "type": "function",
        },
      ]
    `)
  })

  test('exported large function', async () => {
    const code = `export function fetchData(url: string): Promise<Response> {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')
  const options = { method: 'GET', headers }
  const response = fetch(url, options)
  return response
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 8,
    "exported": true,
    "line": 1,
    "name": "fetchData",
    "type": "function",
  },
]
`)
  })

  test('async function', async () => {
    const code = `async function loadData(id: string): Promise<Data> {
  const url = buildUrl(id)
  const response = await fetch(url)
  const json = await response.json()
  const validated = validate(json)
  const transformed = transform(validated)
  return transformed
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
      [
        {
          "endLine": 8,
          "exported": false,
          "line": 1,
          "name": "loadData",
          "type": "function",
        },
      ]
    `)
  })

  test('generator function', async () => {
    const code = `function* generateSequence(start: number, end: number) {
  let current = start
  while (current <= end) {
    const value = current
    current++
    yield value
    console.log('yielded', value)
  }
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('abstract class', async () => {
    const code = `abstract class BaseProcessor {
  abstract process(input: string): string

  protected validate(input: string): boolean {
    return input.length > 0
  }

  protected transform(input: string): string {
    return input.trim()
  }
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 11,
    "exported": false,
    "line": 1,
    "name": "BaseProcessor",
    "type": "class",
  },
]
`)
  })

  test('generic function', async () => {
    const code = `function identity<T>(value: T): T {
  const result = value
  console.log('identity called')
  console.log('value:', result)
  console.log('type:', typeof result)
  console.log('returning...')
  return result
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
      [
        {
          "endLine": 8,
          "exported": false,
          "line": 1,
          "name": "identity",
          "type": "function",
        },
      ]
    `)
  })

  test('generic class', async () => {
    const code = `class Container<T> {
  private items: T[] = []

  add(item: T): void {
    this.items.push(item)
  }

  get(index: number): T {
    return this.items[index]
  }

  size(): number {
    return this.items.length
  }
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 15,
    "exported": false,
    "line": 1,
    "name": "Container",
    "type": "class",
  },
]
`)
  })

  test('multiple exports in one line', async () => {
    const code = `export const a = 1, b = 2, c = 3`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 1,
    "exported": true,
    "line": 1,
    "name": "a",
    "type": "const",
  },
  {
    "endLine": 1,
    "exported": true,
    "line": 1,
    "name": "b",
    "type": "const",
  },
  {
    "endLine": 1,
    "exported": true,
    "line": 1,
    "name": "c",
    "type": "const",
  },
]
`)
  })

  test('export default function', async () => {
    const code = `export default function handler(req: Request): Response {
  const body = req.body
  const parsed = JSON.parse(body)
  const validated = validate(parsed)
  const processed = processData(validated)
  const formatted = format(processed)
  const response = JSON.stringify(formatted)
  return new Response(response)
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 9,
    "exported": true,
    "line": 1,
    "name": "handler",
    "type": "function",
  },
]
`)
  })

  test('class with decorators', async () => {
    const code = `@Injectable()
@Singleton()
class UserService {
  constructor(private db: Database) {}

  async findUser(id: string): Promise<User> {
    return this.db.users.find(id)
  }

  async createUser(data: UserData): Promise<User> {
    return this.db.users.create(data)
  }
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 13,
    "exported": false,
    "line": 1,
    "name": "UserService",
    "type": "class",
  },
]
`)
  })

  test('mixed definitions - filters correctly', async () => {
    const code = `// Small function - excluded
function util(x: number) {
  return x * 2
}

// Large function - included
export function processData(input: string): string {
  const step1 = input.trim()
  const step2 = step1.toUpperCase()
  const step3 = step2.split('')
  const step4 = step3.reverse()
  const step5 = step4.join('')
  return step5
}

// Interface - included
interface Config {
  name: string
}

// Small class - excluded
class Tiny {
  x = 1
}

// Exported const - included
export const VERSION = '1.0.0'

// Type alias - included  
type ID = string | number`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 14,
    "exported": true,
    "line": 7,
    "name": "processData",
    "type": "function",
  },
  {
    "endLine": 19,
    "exported": false,
    "line": 17,
    "name": "Config",
    "type": "interface",
  },
  {
    "endLine": 27,
    "exported": true,
    "line": 27,
    "name": "VERSION",
    "type": "const",
  },
  {
    "endLine": 30,
    "exported": false,
    "line": 30,
    "name": "ID",
    "type": "type",
  },
]
`)
  })
})

// ============================================================================
// JavaScript Tests
// ============================================================================

describe('JavaScript', () => {
  test('large function', async () => {
    const code = `function buildResponse(data) {
  const headers = { 'Content-Type': 'application/json' }
  const body = JSON.stringify(data)
  const status = 200
  const statusText = 'OK'
  const response = { headers, body, status, statusText }
  return response
}`
    const defs = await getDefinitions(code, 'javascript')
    expect(defs).toMatchInlineSnapshot(`
      [
        {
          "endLine": 8,
          "exported": false,
          "line": 1,
          "name": "buildResponse",
          "type": "function",
        },
      ]
    `)
  })

  test('small function', async () => {
    const code = `function add(a, b) {
  return a + b
}`
    const defs = await getDefinitions(code, 'javascript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('large class', async () => {
    const code = `class EventEmitter {
  constructor() {
    this.events = {}
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = []
    }
    this.events[event].push(callback)
  }

  emit(event, data) {
    const callbacks = this.events[event]
    if (callbacks) {
      callbacks.forEach(cb => cb(data))
    }
  }
}`
    const defs = await getDefinitions(code, 'javascript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 19,
    "exported": false,
    "line": 1,
    "name": "EventEmitter",
    "type": "class",
  },
]
`)
  })

  test('IIFE is not extracted', async () => {
    const code = `(function() {
  console.log('init')
  const x = 1
  const y = 2
  const z = 3
  console.log(x, y, z)
  return { x, y, z }
})()`
    const defs = await getDefinitions(code, 'javascript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('function expression assigned to var', async () => {
    const code = `var processItems = function(items) {
  const result = []
  for (const item of items) {
    const processed = item.trim()
    const upper = processed.toUpperCase()
    result.push(upper)
  }
  return result
}`
    const defs = await getDefinitions(code, 'javascript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })
})

// ============================================================================
// Python Tests
// ============================================================================

describe('Python', () => {
  test('large function', async () => {
    const code = `def process_data(items):
    result = []
    for item in items:
        cleaned = item.strip()
        upper = cleaned.upper()
        parts = upper.split(',')
        result.extend(parts)
    return result`
    const defs = await getDefinitions(code, 'python')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 8,
    "exported": false,
    "line": 1,
    "name": "process_data",
    "type": "function",
  },
]
`)
  })

  test('small function', async () => {
    const code = `def add(a, b):
    return a + b`
    const defs = await getDefinitions(code, 'python')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('large class', async () => {
    const code = `class DataProcessor:
    def __init__(self, data):
        self.data = data
        self.processed = False

    def process(self):
        self.data = [x.strip() for x in self.data]
        self.processed = True
        return self

    def get_result(self):
        if not self.processed:
            raise ValueError("Not processed")
        return self.data`
    const defs = await getDefinitions(code, 'python')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 14,
    "exported": false,
    "line": 1,
    "name": "DataProcessor",
    "type": "class",
  },
]
`)
  })

  test('small class', async () => {
    const code = `class Point:
    x: int
    y: int`
    const defs = await getDefinitions(code, 'python')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('async function', async () => {
    const code = `async def fetch_data(url):
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            data = await response.json()
            validated = validate(data)
            processed = process(validated)
            return processed`
    const defs = await getDefinitions(code, 'python')
    expect(defs).toMatchInlineSnapshot(`
      [
        {
          "endLine": 7,
          "exported": false,
          "line": 1,
          "name": "fetch_data",
          "type": "function",
        },
      ]
    `)
  })

  test('decorated function', async () => {
    const code = `@app.route('/api/users')
@require_auth
def get_users():
    users = db.query(User).all()
    serialized = [u.to_dict() for u in users]
    filtered = filter_active(serialized)
    sorted_users = sort_by_name(filtered)
    return jsonify(sorted_users)`
    const defs = await getDefinitions(code, 'python')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('class with inheritance', async () => {
    const code = `class AdminUser(User, PermissionMixin):
    def __init__(self, name, permissions):
        super().__init__(name)
        self.permissions = permissions

    def has_permission(self, perm):
        return perm in self.permissions

    def grant(self, perm):
        self.permissions.add(perm)`
    const defs = await getDefinitions(code, 'python')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 10,
    "exported": false,
    "line": 1,
    "name": "AdminUser",
    "type": "class",
  },
]
`)
  })

  test('lambda is not extracted', async () => {
    const code = `double = lambda x: x * 2
triple = lambda x: x * 3`
    const defs = await getDefinitions(code, 'python')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })
})

// ============================================================================
// Rust Tests
// ============================================================================

describe('Rust', () => {
  test('large function', async () => {
    const code = `fn process_items(items: Vec<String>) -> Vec<String> {
    let mut result = Vec::new();
    for item in items {
        let trimmed = item.trim();
        let upper = trimmed.to_uppercase();
        let parts: Vec<&str> = upper.split(',').collect();
        result.extend(parts.iter().map(|s| s.to_string()));
    }
    result
}`
    const defs = await getDefinitions(code, 'rust')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 10,
    "exported": false,
    "line": 1,
    "name": "process_items",
    "type": "function",
  },
]
`)
  })

  test('small function', async () => {
    const code = `fn add(a: i32, b: i32) -> i32 {
    a + b
}`
    const defs = await getDefinitions(code, 'rust')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('large struct', async () => {
    const code = `struct Config {
    api_url: String,
    timeout: u64,
    retries: u32,
    headers: HashMap<String, String>,
    auth_token: Option<String>,
    debug_mode: bool,
    log_level: String,
    max_connections: usize,
}`
    const defs = await getDefinitions(code, 'rust')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 10,
    "exported": false,
    "line": 1,
    "name": "Config",
    "type": "class",
  },
]
`)
  })

  test('small struct', async () => {
    const code = `struct Point {
    x: i32,
    y: i32,
}`
    const defs = await getDefinitions(code, 'rust')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('large impl block', async () => {
    const code = `impl Calculator {
    fn new() -> Self {
        Calculator { value: 0 }
    }

    fn add(&mut self, n: i32) -> &mut Self {
        self.value += n;
        self
    }

    fn result(&self) -> i32 {
        self.value
    }
}`
    const defs = await getDefinitions(code, 'rust')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 14,
    "exported": false,
    "line": 1,
    "name": "Calculator",
    "type": "class",
  },
]
`)
  })

  test('large trait', async () => {
    const code = `trait Processor {
    fn process(&self, input: &str) -> String;
    fn validate(&self, input: &str) -> bool;
    fn transform(&self, input: &str) -> Vec<String>;
    fn cleanup(&self);
    fn reset(&mut self);
    fn get_status(&self) -> Status;
    fn set_config(&mut self, config: Config);
    fn run(&self) -> Result<(), Error>;
}`
    const defs = await getDefinitions(code, 'rust')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 10,
    "exported": false,
    "line": 1,
    "name": "Processor",
    "type": "class",
  },
]
`)
  })

  test('enum', async () => {
    const code = `enum Status {
    Pending,
    Active,
    Done,
}`
    const defs = await getDefinitions(code, 'rust')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 5,
    "exported": false,
    "line": 1,
    "name": "Status",
    "type": "enum",
  },
]
`)
  })

  test('type alias', async () => {
    const code = `type Result<T> = std::result::Result<T, Error>;`
    const defs = await getDefinitions(code, 'rust')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 1,
    "exported": false,
    "line": 1,
    "name": "Result",
    "type": "type",
  },
]
`)
  })

  test('const item', async () => {
    const code = `const MAX_SIZE: usize = 1024;`
    const defs = await getDefinitions(code, 'rust')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 1,
    "exported": false,
    "line": 1,
    "name": "MAX_SIZE",
    "type": "const",
  },
]
`)
  })

  test('static item', async () => {
    const code = `static COUNTER: AtomicUsize = AtomicUsize::new(0);`
    const defs = await getDefinitions(code, 'rust')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 1,
    "exported": false,
    "line": 1,
    "name": "COUNTER",
    "type": "const",
  },
]
`)
  })

  test('pub function', async () => {
    const code = `pub fn public_handler(request: Request) -> Response {
    let body = request.body();
    let parsed = parse_body(body);
    let validated = validate(parsed);
    let processed = process(validated);
    let serialized = serialize(processed);
    Response::new(serialized)
}`
    const defs = await getDefinitions(code, 'rust')
    expect(defs).toMatchInlineSnapshot(`
      [
        {
          "endLine": 8,
          "exported": false,
          "line": 1,
          "name": "public_handler",
          "type": "function",
        },
      ]
    `)
  })

  test('async function', async () => {
    const code = `async fn fetch_data(url: &str) -> Result<Data, Error> {
    let client = reqwest::Client::new();
    let response = client.get(url).send().await?;
    let body = response.text().await?;
    let parsed = serde_json::from_str(&body)?;
    let validated = validate(parsed)?;
    Ok(validated)
}`
    const defs = await getDefinitions(code, 'rust')
    expect(defs).toMatchInlineSnapshot(`
      [
        {
          "endLine": 8,
          "exported": false,
          "line": 1,
          "name": "fetch_data",
          "type": "function",
        },
      ]
    `)
  })

  test('macro definition is not extracted', async () => {
    const code = `macro_rules! create_function {
    ($name:ident) => {
        fn $name() {
            println!("Called {}", stringify!($name));
        }
    };
}`
    const defs = await getDefinitions(code, 'rust')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })
})

// ============================================================================
// Go Tests
// ============================================================================

describe('Go', () => {
  test('large function', async () => {
    const code = `func processItems(items []string) []string {
	result := make([]string, 0)
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		upper := strings.ToUpper(trimmed)
		parts := strings.Split(upper, ",")
		result = append(result, parts...)
	}
	return result
}`
    const defs = await getDefinitions(code, 'go')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 10,
    "exported": false,
    "line": 1,
    "name": "processItems",
    "type": "function",
  },
]
`)
  })

  test('small function', async () => {
    const code = `func add(a, b int) int {
	return a + b
}`
    const defs = await getDefinitions(code, 'go')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('large method', async () => {
    const code = `func (c *Calculator) Process(input string) string {
	step1 := strings.TrimSpace(input)
	step2 := strings.ToUpper(step1)
	step3 := strings.Split(step2, ",")
	step4 := strings.Join(step3, "-")
	step5 := step4 + "!"
	return step5
}`
    const defs = await getDefinitions(code, 'go')
    expect(defs).toMatchInlineSnapshot(`
      [
        {
          "endLine": 8,
          "exported": false,
          "line": 1,
          "name": "Process",
          "type": "function",
        },
      ]
    `)
  })

  test('type struct', async () => {
    const code = `type Config struct {
	APIUrl  string
	Timeout int
}`
    const defs = await getDefinitions(code, 'go')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 4,
    "exported": false,
    "line": 1,
    "name": "Config",
    "type": "type",
  },
]
`)
  })

  test('type interface', async () => {
    const code = `type Reader interface {
	Read(p []byte) (n int, err error)
}`
    const defs = await getDefinitions(code, 'go')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 3,
    "exported": false,
    "line": 1,
    "name": "Reader",
    "type": "type",
  },
]
`)
  })

  test('const declaration', async () => {
    const code = `const MaxRetries = 3`
    const defs = await getDefinitions(code, 'go')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 1,
    "exported": false,
    "line": 1,
    "name": "MaxRetries",
    "type": "const",
  },
]
`)
  })

  test('var declaration', async () => {
    const code = `var DefaultTimeout = time.Second * 30`
    const defs = await getDefinitions(code, 'go')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 1,
    "exported": false,
    "line": 1,
    "name": "DefaultTimeout",
    "type": "const",
  },
]
`)
  })

  test('exported function (capitalized)', async () => {
    const code = `func ProcessData(input string) (string, error) {
	if input == "" {
		return "", errors.New("empty input")
	}
	trimmed := strings.TrimSpace(input)
	upper := strings.ToUpper(trimmed)
	validated := validate(upper)
	return validated, nil
}`
    const defs = await getDefinitions(code, 'go')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 9,
    "exported": false,
    "line": 1,
    "name": "ProcessData",
    "type": "function",
  },
]
`)
  })

  test('init function is extracted if large', async () => {
    const code = `func init() {
	config = loadConfig()
	db = connectDB()
	cache = initCache()
	logger = setupLogger()
	metrics = initMetrics()
	validator = newValidator()
	handlers = registerHandlers()
}`
    const defs = await getDefinitions(code, 'go')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 9,
    "exported": false,
    "line": 1,
    "name": "init",
    "type": "function",
  },
]
`)
  })

  test('type alias', async () => {
    const code = `type UserID = int64`
    const defs = await getDefinitions(code, 'go')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  test('empty file', async () => {
    const defs = await getDefinitions('', 'typescript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('only comments', async () => {
    const code = `// This is a comment
// Another comment
/* Block comment */`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('only imports', async () => {
    const code = `import { foo } from 'bar'
import * as baz from 'qux'`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('nested functions - only top level', async () => {
    const code = `function outer(x: number): number {
  function inner(y: number): number {
    return y * 2
  }
  const result = inner(x)
  const doubled = result * 2
  const tripled = result * 3
  return doubled + tripled
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 9,
    "exported": false,
    "line": 1,
    "name": "outer",
    "type": "function",
  },
]
`)
  })

  test('boundary: exactly 8 lines included', async () => {
    const code = `function eightLines(): void {
  const a = 1
  const b = 2
  const c = 3
  const d = 4
  const e = 5
  console.log(a, b, c, d, e)
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 8,
    "exported": false,
    "line": 1,
    "name": "eightLines",
    "type": "function",
  },
]
`)
  })

  test('boundary: exactly 7 lines excluded', async () => {
    const code = `function sevenLines(): void {
  const a = 1
  const b = 2
  const c = 3
  const d = 4
  console.log(a, b, c, d)
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
      [
        {
          "endLine": 7,
          "exported": false,
          "line": 1,
          "name": "sevenLines",
          "type": "function",
        },
      ]
    `)
  })

  test('function with multiline signature', async () => {
    const code = `function complexSignature(
  param1: string,
  param2: number,
  param3: boolean,
  param4: object
): Result {
  const combined = combine(param1, param2)
  const processed = process(combined, param3)
  return finalize(processed, param4)
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 10,
    "exported": false,
    "line": 1,
    "name": "complexSignature",
    "type": "function",
  },
]
`)
  })

  test('class with static members', async () => {
    const code = `class Singleton {
  private static instance: Singleton

  private constructor() {}

  static getInstance(): Singleton {
    if (!Singleton.instance) {
      Singleton.instance = new Singleton()
    }
    return Singleton.instance
  }
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 12,
    "exported": false,
    "line": 1,
    "name": "Singleton",
    "type": "class",
  },
]
`)
  })

  test('re-export statement', async () => {
    const code = `export { foo, bar } from './module'
export * from './other'`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('interface with generics', async () => {
    const code = `interface Repository<T, ID> {
  find(id: ID): Promise<T | null>
  findAll(): Promise<T[]>
  save(entity: T): Promise<T>
  delete(id: ID): Promise<void>
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 6,
    "exported": false,
    "line": 1,
    "name": "Repository",
    "type": "interface",
  },
]
`)
  })

  test('mapped type', async () => {
    const code = `type Readonly<T> = {
  readonly [P in keyof T]: T[P]
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 3,
    "exported": false,
    "line": 1,
    "name": "Readonly",
    "type": "type",
  },
]
`)
  })

  test('conditional type', async () => {
    const code = `type NonNullable<T> = T extends null | undefined ? never : T`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 1,
    "exported": false,
    "line": 1,
    "name": "NonNullable",
    "type": "type",
  },
]
`)
  })

  test('overloaded function signatures', async () => {
    const code = `function process(input: string): string
function process(input: number): number
function process(input: string | number): string | number {
  if (typeof input === 'string') {
    return input.toUpperCase()
  }
  return input * 2
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
      [
        {
          "endLine": 8,
          "exported": false,
          "line": 3,
          "name": "process",
          "type": "function",
        },
      ]
    `)
  })

  test('namespace', async () => {
    const code = `namespace Utils {
  export function helper(x: number): number {
    return x * 2
  }

  export const VERSION = '1.0.0'
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('declare statements', async () => {
    const code = `declare function external(x: string): void
declare class ExternalClass {
  method(): void
}
declare const CONFIG: { url: string }`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`[]`)
  })

  test('unicode identifiers', async () => {
    const code = `function 计算(输入: number): number {
  const 结果 = 输入 * 2
  const 验证 = validate(结果)
  const 处理 = process(验证)
  const 格式化 = format(处理)
  const 输出 = finalize(格式化)
  return 输出
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
      [
        {
          "endLine": 8,
          "exported": false,
          "line": 1,
          "name": "计算",
          "type": "function",
        },
      ]
    `)
  })

  test('private class fields', async () => {
    const code = `class SecureStorage {
  #data: Map<string, string> = new Map()
  #key: string

  constructor(key: string) {
    this.#key = key
  }

  #encrypt(value: string): string {
    return btoa(value + this.#key)
  }

  set(key: string, value: string): void {
    this.#data.set(key, this.#encrypt(value))
  }
}`
    const defs = await getDefinitions(code, 'typescript')
    expect(defs).toMatchInlineSnapshot(`
[
  {
    "endLine": 16,
    "exported": false,
    "line": 1,
    "name": "SecureStorage",
    "type": "class",
  },
]
`)
  })
})
