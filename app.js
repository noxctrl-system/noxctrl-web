let disturbance = false;

function toggleDisturbance() {
  disturbance = !disturbance;

  const btn = document.getElementById("disturbanceBtn");

  if (disturbance) {
    btn.innerText = "EIN";
    btn.style.background = "green";
  } else {
    btn.innerText = "AUS";
    btn.style.background = "gray";
  }
}

function scan() {
  document.getElementById("status").innerText = "Scan läuft...";
  
  setTimeout(() => {
    document.getElementById("status").innerText = "Keine Geräte (Demo)";
  }, 2000);
}
