'use strict';
document.querySelector('.login-form').addEventListener('submit', function () {
    const btn = this.querySelector('.btn-login');
    btn.disabled = true;
    btn.textContent = 'កំពុងចូល...';
});
