# My Day by Chepo

Organizador personal en español: plan diario y semanal, rutinas editables, viernes libre/OT, tres días de entrenamiento por semana, prioridades, notas, sesiones de enfoque y respaldos JSON.

## Ejecutar

`node server.mjs` abre un servidor local en http://127.0.0.1:4173.

`npm test` ejecuta las pruebas de planificación, reprogramación, OT, validación de respaldos, recuperación del guardado y caché sin conexión.

## Entrenamientos

El contador grande muestra días completados. Cada día se cuenta una sola vez, aunque tenga varias sesiones. Tocar un día vacío abre una reserva para esa fecha; tocar un día programado lo marca como completado, y volver a tocarlo lo deja pendiente. También puedes completar la tarea desde Mi día.

Al elegir el área Movimiento al crear o editar una tarea, se activa Cuenta como entrenamiento. Puedes desmarcar esa opción para actividades que no quieras contar en la meta.

Las versiones de los módulos, estilos y caché se coordinan para evitar mezclar archivos de publicaciones distintas. La actualización conserva las tareas y notas del navegador.

## GitHub Pages

La app no necesita instalación ni compilación. Los archivos de la app están en la raíz del repositorio. En Settings → Pages, seleccionar Deploy from a branch, rama main, carpeta /(root). El archivo .nojekyll permite servir los módulos y assets directamente.

## Datos

Esta versión guarda tareas y notas en localStorage. El navegador ofrece un respaldo JSON en Ajustes. Los datos que introduzcas no se suben al repositorio. La app pública empieza sin tareas ni horarios personales. Un plan se importa desde un archivo JSON y permanece en el navegador; los respaldos personales no se incluyen en el repositorio. Publicar la app no añade sincronización entre dispositivos; esa función requiere almacenamiento y autenticación del lado del servidor.

Los compromisos fijos y los extras opcionales quedan fuera del porcentaje de tareas esenciales. El contador de entrenamiento cuenta días distintos; permite reubicar sesiones. Viernes libre/OT se decide por semana y conserva los cambios que ya hiciste en tareas individuales.

## Instalación

El manifiesto y el service worker permiten añadir la app a la pantalla de inicio en navegadores compatibles. Tras una primera carga, el navegador puede conservar los archivos de la app para usarlos sin conexión. El temporizador no genera notificaciones con la app cerrada.

La marca visible es My Day by Chepo; la interfaz permanece en español. Se conserva la clave de guardado anterior para facilitar la migración cuando se usa el mismo origen. Para pasar de un archivo local a la página publicada, exportar el respaldo e importarlo en la página nueva.
