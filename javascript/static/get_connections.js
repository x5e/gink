function getConnections() {
    $.ajax({
        url: `${window.location.origin}/list_connections`,
        type: 'GET',
        success: function (data) {
            $("#connections-list").remove();
            let body = document.querySelector("body");
            let list = body.appendChild(document.createElement("ul"));
            list.setAttribute("id", "connections-list");
            let open_connections = JSON.parse(data);
            for (const [key, val] of open_connections) {
                let li = list.appendChild(document.createElement("li"));
                li.innerHTML = `${key} -> ${val}`;
            }

        },
        error: function (error) {
            console.log(error);
        }
    });
}