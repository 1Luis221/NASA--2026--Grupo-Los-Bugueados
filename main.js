const password = document.getElementById("password");
const mostrarPassword = document.getElementById("mostrarPassword");
const loginForm = document.getElementById("loginForm");
const mensaje = document.getElementById("mensaje");

// Mostrar u ocultar contraseña

mostrarPassword.addEventListener("click", function () {

    if (password.type === "password") {
        password.type = "text";
        mostrarPassword.innerHTML = '<i data-lucide="eye-off"></i>';
    } else {
        password.type = "password";
        mostrarPassword.innerHTML = '<i data-lucide="eye"></i>';
    }

    lucide.createIcons();
});

// Validación visual del formulario

loginForm.addEventListener("submit", function (event) {

    event.preventDefault();

    const usuario = document.getElementById("usuario").value.trim();
    const clave = password.value;

    if (usuario === "" || clave === "") {
        mensaje.textContent = "Completa todos los campos.";
        return;
    }

    mensaje.textContent =
        "Formulario listo. Falta conectar la autenticación del servidor.";

});

// Dibuja los íconos al cargar la página
lucide.createIcons();
