// Quick test script to check signup endpoint
import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000/api/auth/signup';

const testSignup = async () => {
  try {
    console.log('Testing signup endpoint...');
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: `test${Date.now()}@example.com`,
        password: 'test123',
        name: 'Test User',
      }),
    });

    const data = await response.json();
    
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('✅ Signup test passed!');
    } else {
      console.log('❌ Signup test failed:', data.error);
    }
  } catch (error) {
    console.error('❌ Test error:', error.message);
    console.error('Make sure the server is running on http://localhost:3000');
  }
};

testSignup();
