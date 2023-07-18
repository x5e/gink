const socket = new WebSocket('ws://127.0.0.1:8080');
let peers = [];

socket.onmessage = function(event) {
  if (event.data instanceof Blob) {
    const reader = new FileReader();
    reader.onload = function() {
      const textData = reader.result;
      try {
        peers = JSON.parse(textData);
        updatePeersList();
      } catch (error) {
        console.error('Error parsing JSON:', error);
      }
    };
    reader.readAsText(event.data);
  } else {
    try {
      peers = JSON.parse(event.data);
      updatePeersList();
    } catch (error) {
      console.error('Error parsing JSON:', error);
    }
  }
};

function updatePeersList() {
  const peersList = document.getElementById('peersList');
  peersList.innerHTML = '';

  if (peers.length > 0) {
    peers.forEach(function(connectionId) {
      const listItem = document.createElement('li');
      listItem.textContent = connectionId.toString();
      peersList.appendChild(listItem);
    });
  } else {
    peersList.innerHTML = 'No peers';
  }
}

socket.onopen = function() {
  socket.send('getPeers');
};
