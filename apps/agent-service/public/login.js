import { api } from './client-api.js'

const form = document.querySelector('#login-form')
const error = document.querySelector('#login-error')

async function redirectWhenSignedIn() {
  try {
    await api('/api/me')
    window.location.replace('/console')
  } catch {
    // An unauthenticated visitor stays on the login page.
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  error.hidden = true
  try {
    await api('/api/login', {
      method: 'POST',
      body: {
        username: document.querySelector('#login-username').value,
        password: document.querySelector('#login-password').value,
      },
    })
    window.location.replace('/console')
  } catch (loginError) {
    error.textContent = loginError.message
    error.hidden = false
  }
})

void redirectWhenSignedIn()
