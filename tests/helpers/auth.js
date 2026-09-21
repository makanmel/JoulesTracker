import request from 'supertest';

let counter = 0;

export async function registerAndLogin(app) {
  const email = `user-${Date.now()}-${counter++}@test.com`;
  const res = await request(app).post('/api/v1/auth/register').send({ email, password: 'password123' });
  if (res.status !== 201) {
    throw new Error(`Failed to register test user: ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.accessToken, user: res.body };
}
