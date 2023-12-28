const pathTemplate = document.createElement('template');
pathTemplate.innerHTML = `
    <style> 
        .path-item {
            display: flex;
            cursor: pointer;
            justify-content: center;
            border-radius: 6px;
            color: gray;
            margin-right: 5px;
            margin-left: 5px;
            padding-left: 2px;
            padding-right: 2px;
        }
        .path-item:hover {
            box-shadow: 0 0 10px rgba(33,33,33,.5);
            background-color: gray;
            color: white;
        }
    </style>
    <div class='path-item'>
        <slot></slot>
    </div>
`;

class PathItem extends HTMLElement {
    constructor() {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        shadow.append(pathTemplate.content.cloneNode(true));
    }
}
customElements.define('path-item', PathItem);