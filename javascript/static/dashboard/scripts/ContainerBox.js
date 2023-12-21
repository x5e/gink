const template = document.createElement('template');
template.innerHTML = `
    <style> 
        div {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background-color: gray;
            color: white;
            border-radius: 10px;
            height: 2rem;
            width: 8rem;
        }
    </style>
    <div>
        <slot></slot>
    </div>
`;

class ContainerBox extends HTMLElement {
    constructor() {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        shadow.append(template.content.cloneNode(true));

    }
}
customElements.define('container-box', ContainerBox);