const form = document.querySelector('form');

form.addEventListener('submit', (e) => {
  const emailInput = document.getElementById('email');
  const email = emailInput.value;

  const emailPattern = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  
  if (!emailPattern.test(email)) {
    e.preventDefault();
    alert('Моля, въведете валиден имейл!');
  }
});
