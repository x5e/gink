function createConnection() {
    let ipAddress = document.getElementById("ipAddress").value;
    $.ajax({
        url: `${window.location.origin}/create_connection?ipAddress=${ipAddress}`,
        type: 'POST',
        success: function (data) {
            $(".connection-msg").remove();
            data = JSON.parse(data);
            let body = document.querySelector("body");
            let p = body.appendChild(document.createElement("p"));
            p.setAttribute("class", "connection-msg");
            p.innerHTML = data["message"];
        },
        error: function (error) {
            console.log(error);
        }
    });
}
