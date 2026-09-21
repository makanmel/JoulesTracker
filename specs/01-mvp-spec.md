# JoulesTracker — MVP Specification

## 1. Goal

Build a minimal web-based calorie/energy tracker in JavaScript that lets users log what they eat, see daily totals, and stay within a calorie target.

## 2. Core Features

1. **User accounts** — register, log in, log out with JWT.
2. **Food catalog** — browse built-in foods and create custom foods.
3. **Meal logging** — add, edit, delete entries per day and meal type.
4. **Daily summary** — view calories consumed vs. target for any date.
5. **Calorie target** — set and update a daily target.

## 3. User Stories

- As a user, I want to register so my food log is private to me.
- As a user, I want to log a meal so I can track what I ate.
- As a user, I want to see my total calories for today so I can compare with my target.
- As a user, I want to edit a meal entry when I make a mistake.
- As a user, I want to set a daily calorie target so I can work toward a goal.
- As a user, I want to add custom foods so I can track items not in the catalog.

## 4. Data Models & Schema

### 4.1 User

```js
{
  id: UUID PRIMARY KEY,
  email: STRING UNIQUE NOT NULL,
  passwordHash: STRING NOT NULL,
  createdAt: ISO_STRING NOT NULL,
  updatedAt: ISO_STRING NOT NULL
}
```

### 4.2 Food

```js
{
  id: UUID PRIMARY KEY,
  name: STRING NOT NULL,
  caloriesPer100g: DECIMAL NOT NULL,   // kcal per 100 g
  proteinPer100g: DECIMAL DEFAULT 0,
  carbsPer100g: DECIMAL DEFAULT 0,
  fatPer100g: DECIMAL DEFAULT 0,
  isDefault: BOOLEAN DEFAULT false,  // true = shipped with the app
  createdBy: UUID NULL REFERENCES User(id),
  createdAt: ISO_STRING NOT NULL,
  updatedAt: ISO_STRING NOT NULL
}
```

### 4.3 MealEntry

```js
{
  id: UUID PRIMARY KEY,
  userId: UUID NOT_NULL REFERENCES User(id) ON DELETE CASCADE,
  foodId: UUID NOT_NULL REFERENCES Food(id) ON DELETE RESTRICT,
  quantityGrams: DECIMAL NOT_NULL CHECK > 0,
  mealDate: DATE_STRING NOT_NULL,    // YYYY-MM-DD
  mealType: ENUM NOT_NULL,           // breakfast | lunch | dinner | snack
  calculatedCalories: DECIMAL NOT_NULL,
  createdAt: ISO_STRING NOT_NULL,
  updatedAt: ISO_STRING NOT NULL
}
```

**Calculation rule:**

```js
calculatedCalories = (food.caloriesPer100g * quantityGrams) / 100;
```

Stored on write to keep summary queries fast and deterministic.

### 4.4 DailyTarget

```js
{
  id: UUID PRIMARY KEY,
  userId: UUID NOT_NULL REFERENCES User(id) ON DELETE CASCADE,
  targetDate: DATE_STRING NOT_NULL,  // YYYY-MM-DD
  targetCalories: DECIMAL NOT_NULL CHECK >= 0,
  createdAt: ISO_STRING NOT_NULL,
  updatedAt: ISO_STRING NOT NULL,
  UNIQUE(userId, targetDate)
}
```

A missing target for a date means the user has not set one; summaries show target as `null`.

## 5. REST API Endpoints

Base URL: `/api/v1`

### 5.1 Authentication

#### POST /auth/register

**Request**

```json
{
  "email": "user@example.com",
  "password": "min8Chars"
}
```

**Response 201**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "accessToken": "jwt",
  "createdAt": "2026-09-21T10:00:00.000Z"
}
```

**Errors**

- `400` — email invalid or password < 8 chars.
- `409` — email already exists.

#### POST /auth/login

**Request**

```json
{
  "email": "user@example.com",
  "password": "min8Chars"
}
```

**Response 200**

```json
{
  "accessToken": "jwt"
}
```

**Errors**

- `401` — invalid credentials.

#### POST /auth/logout

Requires `Authorization: Bearer <jwt>`.

**Response 204** — no body.

### 5.2 Foods

All require authentication.

#### GET /foods

Query: `?q=chicken&limit=20&offset=0`

**Response 200**

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Chicken breast",
      "caloriesPer100g": 165,
      "proteinPer100g": 31,
      "carbsPer100g": 0,
      "fatPer100g": 3.6,
      "isDefault": true
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

#### POST /foods

**Request**

```json
{
  "name": "Greek yogurt",
  "caloriesPer100g": 59,
  "proteinPer100g": 10,
  "carbsPer100g": 3.6,
  "fatPer100g": 0.4
}
```

**Response 201** — returns created food with `id`, `createdBy`, `createdAt`.

**Errors**

- `400` — name empty or calories < 0.

#### GET /foods/:id

**Response 200** — single food object.

**Errors**

- `404` — not found.
- `403` — food is custom and belongs to another user.

#### PATCH /foods/:id

Only allowed for custom foods owned by the authenticated user.

**Request**

```json
{
  "name": "Greek yogurt 2%",
  "caloriesPer100g": 73
}
```

**Response 200** — updated food.

**Errors**

- `403` — default foods or another user's food cannot be edited.
- `404` — not found.

#### DELETE /foods/:id

Only allowed for custom foods owned by the authenticated user with no existing meal entries referencing them.

**Response 204** — no body.

**Errors**

- `403` — cannot delete default or another user's food.
- `409` — food is referenced by meal entries.

### 5.3 Meals

All require authentication.

#### GET /meals

Query: `?date=2026-09-21`

**Response 200**

```json
{
  "date": "2026-09-21",
  "items": [
    {
      "id": "uuid",
      "food": { /* embedded Food object */ },
      "quantityGrams": 150,
      "mealType": "lunch",
      "calculatedCalories": 247.5
    }
  ],
  "totals": {
    "calories": 247.5,
    "protein": 46.5,
    "carbs": 5.4,
    "fat": 5.4
  }
}
```

Items are sorted by `mealType` order (`breakfast`, `lunch`, `dinner`, `snack`) then `createdAt`.

#### POST /meals

**Request**

```json
{
  "foodId": "uuid",
  "quantityGrams": 150,
  "mealDate": "2026-09-21",
  "mealType": "lunch"
}
```

**Response 201** — created meal with embedded food and calculated calories.

**Errors**

- `400` — invalid `mealType`, non-positive quantity, or invalid date.
- `404` — food not found.

#### PATCH /meals/:id

Only allowed for the owning user.

**Request** (all fields optional)

```json
{
  "quantityGrams": 200,
  "mealType": "dinner"
}
```

**Response 200** — updated meal with recalculated calories.

**Errors**

- `403` — meal belongs to another user.
- `404` — not found.

#### DELETE /meals/:id

Only allowed for the owning user.

**Response 204** — no body.

**Errors**

- `403` — meal belongs to another user.
- `404` — not found.

### 5.4 Daily Target

All require authentication.

#### GET /daily-target

Query: `?date=2026-09-21`

**Response 200**

```json
{
  "date": "2026-09-21",
  "targetCalories": 2000
}
```

If no target exists:

```json
{
  "date": "2026-09-21",
  "targetCalories": null
}
```

#### PUT /daily-target

**Request**

```json
{
  "targetDate": "2026-09-21",
  "targetCalories": 2000
}
```

**Response 200** — returns stored target.

**Errors**

- `400` — `targetCalories` negative.

## 6. Required Tests

### 6.1 Unit Tests

Run with the project's test runner (e.g., Vitest or Jest).

- **Calorie calculation service**
  - `calculateCalories(165, 150)` returns `247.5`.
  - Rounds to one decimal place.
- **Input validation**
  - reject empty food name.
  - reject negative calories.
  - reject invalid `mealType`.
  - reject password shorter than 8 characters.
- **JWT helpers**
  - sign and verify tokens.
  - reject expired tokens.
- **Summary aggregation**
  - sum multiple meal entries correctly by date.
  - return zero totals when no entries exist.

### 6.2 Integration Tests

Use a separate in-memory or throwaway test database.

- **Auth flow**
  - register returns 201 and a token.
  - duplicate email returns 409.
  - login returns 200 with token.
  - login with wrong password returns 401.
- **Food endpoints**
  - create custom food returns 201.
  - default foods are visible to any authenticated user.
  - patch another user's food returns 403.
- **Meal endpoints**
  - log a meal and see it in `GET /meals`.
  - update quantity recalculates calories.
  - delete meal removes it from totals.
  - accessing another user's meal returns 403/404.
- **Daily summary**
  - summary includes correct totals.
  - missing target returns `targetCalories: null`.
- **Database constraints**
  - deleting a food referenced by meals is blocked.
  - deleting a user cascades to their meals and targets.

## 7. Acceptance Criteria

- [ ] A new user can register and immediately log a meal.
- [ ] The daily summary shows total calories consumed and the target for the selected date.
- [ ] Users can edit and delete their own meal entries; changes are reflected in totals.
- [ ] Default foods ship with the app and cannot be edited by users.
- [ ] Custom foods can be created, updated, and deleted if unused.
- [ ] All endpoints return proper HTTP status codes and JSON error bodies.
- [ ] Unit tests cover core calculation and validation logic.
- [ ] Integration tests cover auth, meals, foods, and summary endpoints with a test database.
- [ ] CI runs tests and lint on every pull request.

## 8. Out of Scope for MVP

- Mobile apps or offline sync.
- Barcode scanning or third-party food APIs.
- Weight tracking or exercise logging.
- Macro goals beyond calories.
- Social features or sharing.
- Admin dashboard.

## 9. Tech Stack (Suggested)

- **Runtime:** Node.js 20+
- **Framework:** Express or Fastify
- **Database:** SQLite for MVP (PostgreSQL for production)
- **ORM/Query Builder:** Prisma or Drizzle
- **Auth:** bcrypt + JWT
- **Tests:** Vitest + Supertest
- **Lint:** ESLint + Prettier
