$W.ArrayBuffer = function(name, data) {
    this.name = name;
    this.data = data;
    this.glData = new WebGLFloatArray(data);
    this.glBuffer = $W.GL.createBuffer();

    this.setData = function ABUF_setData(data) {
        this.data = data;
        this.glData = new WebGLFloatArray(data);
    };

    this.buffer = function ABUF_buffer() {
        try {
            this.bind();
            $W.GL.bufferData($W.GL.ARRAY_BUFFER, this.glData, $W.GL.STATIC_DRAW);
            this.unbind();
        }catch (e) {
            console.error(e);
        }
    };

    this.associate = function ABUF_associate(attrib) {
        try {
            this.bind();
            $W.GL.enableVertexAttribArray(attrib.location);
            //$W.GL.bufferData($W.GL.ARRAY_BUFFER, this.glData, $W.GL.STATIC_DRAW);
            $W.GL.vertexAttribPointer(attrib.location, attrib.length,
                    $W.GL.FLOAT, false, 0, 0);
            this.unbind();
        }catch (e) {
            console.error("Failed to associate array buffer `" + this.name + 
                    "` with vertex attribute `" + attrib.name + "`");
            console.dir(this, attrib);
            console.error(e);
        }
    };

    this.bind = function ABUF_bind() {
        $W.GL.bindBuffer($W.GL.ARRAY_BUFFER, this.glBuffer);
    };
    this.unbind = function ABUF_unbind() {
        $W.GL.bindBuffer($W.GL.ARRAY_BUFFER, null);
    };
};


$W.RENDERABLE   = 1;
$W.PICKABLE     = 2;
/** @class Contains pertinent render information for an individual renderable entity.
 *
 * Make sure to set vertexCount correctly
 * Animations are clunky right now, I'm working on it.
 *
 * @param type The type of rendering to use for this object, possible values
 * are:<br>
 * $W.GL.POINTS         <br>
 * $W.GL.LINES          <br>
 * $W.GL.LINE_LOOP      <br>
 * $W.GL.LINE_STRIP     <br>
 * $W.GL.TRIANGLES      <br>
 * $W.GL.TRIANGLE_STRIP <br>
 * $W.GL.TRIANGLE_FAN   <br>
 * @param {Boolean} shouldAdd Set to false to not add this the the object
 * list in case you want to handle rendering in a specific manner, e.g. as
 * the child of another object.
 */
$W.Object = function (type, flags) {
    //console.group("Creating object");
    $W.ObjectState.call(this);

    $W.objects.push(this);

    if (typeof(flags) === 'undefined' ||/*backcompat*/ flags === true) {
        flags = $W.RENDERABLE | $W.PICKABLE;
    }/*backcompat*/else if(flags === false) {
        flags = $W.PICKABLE;
    }


    if (flags & $W.RENDERABLE){
        $W.renderables.push(this);
    }

    if (flags & $W.PICKABLE) {
        $W.pickables.push(this);
    }


    /** Number of vertices in this object.
     * Used when rendering with drawArrays.
     */
    this.vertexCount = 0;

    this.id = $W.createdObjectCount++;

    /* The type of rendering to use for this object */
    this.type = type; 

    this._elements = false;
    this._elementBuffer = null;
    this._elementCount = 0;

    this.material = $W.materials['wglu_default'];

    this.arrayBuffers = [];

    this.children = [];

    /** The animation for this object. */
    this.animation = new $W.anim.ProceduralAnimation();

    this._drawFunction = null;

    this._drawArrays = function() {
        return (function OBJ_drawArrays(obj, mat) {
            try {
                $W.GL.drawArrays(obj.type, 0, obj.vertexCount);
            }catch (e) {
                console.error("drawArrays Failure");
                console.error(e);
            }
        });
    };

    this._drawElements = function() {
        return (function OBJ_drawElements(obj, mat) {
            $W.GL.bindBuffer($W.GL.ELEMENT_ARRAY_BUFFER, obj._elementBuffer);
            try {
                $W.GL.drawElements(obj.type, obj._elementCount, 
                    $W.GL.UNSIGNED_SHORT, obj._elements);
            }catch (e) {
                console.error("drawElements Failure");
                console.error(e);
            }
        });
    };


    /** Name of shader program used to render this object */
    /** Add an object as a child to this object.
     * @param {Object} obj The object to add as a child.
     */
    this.addChild = function(obj) {
        this.children.push(obj);
    };

    /** Set the indices for the elements of this object.
     * Draws this object with drawElements unless set with
     * false.
     * @param {Array|Boolean} elements The array of indices of the
     * elements or false, which disabled drawElements rendering
     * for this object.
     */
    this.setElements = function(elements) {
        // don't use drawElements
        if (elements === false) {
            this._elements = false;
            this._drawFunction = this._drawArrays();
            $W.GL.bindBuffer($W.GL.ELEMENT_ARRAY_BUFFER, null);

        // use drawElements
        }else {
            this._elements = elements.flatten();
            this._elementCount = this._elements.length;
            this._elementBuffer = $W.GL.createBuffer();
            this._drawFunction = this._drawElements();
            $W.GL.bindBuffer($W.GL.ELEMENT_ARRAY_BUFFER, this._elementBuffer);
            $W.GL.bufferData($W.GL.ELEMENT_ARRAY_BUFFER,new WebGLUnsignedShortArray(this._elements), 
                    $W.GL.STATIC_DRAW);
        }
    };

    this.setMaterial = function OBJ_setMaterial(material) {
        if (typeof(material) === 'string') { 
            this.material = $W.materials[material];
        }else {
            this.material = material;
        }
    };

    /** Fills the array of the given name, where name is a 
     * vertex attribute in the shader. 
     * Also creates a buffer to hold the data in WebGL.
     * @param {String} name The attribute variable name in a shader
     * attached to the shader program used by this object. (this is
     * not verified for you)
     * @param {Array} contents The data to pass to the attribute.
     */
    this.fillArray = function OBJ_fillArray(name, data) {
        data = data.flatten();
        if (typeof(this.arrayBuffers[name]) === 'undefined') {
            this.arrayBuffers[name] = new $W.ArrayBuffer(name, data);
        }else {
            this.arrayBuffers[name].setData(data);
        }

        this.arrayBuffers[name].buffer();
    };

    // These allow us to do array or element drawing without
    // testing a boolean every frame

    // drawArrays by default
    this._drawFunction = this._drawArrays();
    
    /** draw this object at the given postion, rotation, and scale
     * @param {3 Element Array} pos Position array.
     * @param {Matrix} rot Rotation matrix.
     * @param {3 Element Array} scale Scaling array.
     */
    this.drawAt = function OBJ_drawAt(pos, rot, scale) {
            $W.modelview.push();

            $W.modelview.translate(pos);
            $W.modelview.multiply(rot);
            $W.modelview.scale(scale);

            for (var i = 0; i < this.children.length; i++) {
                this.children[i].draw();
            }

            $W.renderer.renderObject(this, this.material, this._drawFunction);

            $W.modelview.pop();
            $W.GL.bindTexture($W.GL.TEXTURE_2D, null);
    };

    this.drawChildrenAt = function(pos, rot, scale) {
            $W.modelview.pushMatrix();

            $W.modelview.translate(pos);
            $W.modelview.multMatrix(rot);
            $W.modelview.scale(scale);

            for (var i = 0; i < this.children.length; i++) {
                this.children[i].draw();
            }

            $W.modelview.popMatrix();
    };

    /** draw this object at its internally stored position, rotation, and
     * scale, INCLUDING its current animation state.
     */
    this.draw = function OBJ_draw() {
        this.drawAt(
            this.animatedPosition().elements, 
            this.animatedRotation().matrix(),
            this.animatedScale().elements
        );
    };

    this.drawChildren = function() {
        this.drawChildrenAt(
            this.animatedPosition().elements, 
            this.animatedRotation().matrix(),
            this.animatedScale().elements
        );
    };

    /** Update this object's animation state. 
     * @param {Number} dt The delta time since the previous call to
     * update.
     */
    this.update = function(dt) {
        this.animation.update(dt);

        for (var i = 0; i < this.children.length; i++) {
            this.children[i].update(dt);
        }
    };

    
    /** @returns {Vector} The sum of the object's base position and its 
     * animation.
     */
    this.animatedPosition = function() { 
        return this.position.add(this.animation.position); 
    };

    /** @returns {Vector} The sum of the object's base rotation and its 
     * animation. 
     */
    this.animatedRotation = function() { 
        //return this.rotation.add(this.animation.rotation); 
        return this.q.multiply(this.animation.q);
    };

    /** @returns {Vector} The product of the object's base scale and its 
     * animation. 
     */
    this.animatedScale    = function() { 
        return $V([
            this.scale.e(1) * this.animation.scale.e(1),
            this.scale.e(3) * this.animation.scale.e(2),
            this.scale.e(3) * this.animation.scale.e(3)
        ]);
    };

    /** Set the x y and z components of the object's scale to the given
     * value.
     * @param {Number} s New scale of the object.
     */
    this.setScaleUniformly = function(s) { 
        this.scale = $V([s,s,s]); 
    };

    //console.groupEnd();
};
/** @author Benjamin DeLillo */
/*
     *  Copyright (c) 2009 Benjamin P. DeLillo
     *  
     *  Permission is hereby granted, free of charge, to any person
     *  obtaining a copy of this software and associated documentation
     *  files (the "Software"), to deal in the Software without
     *  restriction, including without limitation the rights to use,
     *  copy, modify, merge, publish, distribute, sublicense, and/or sell
     *  copies of the Software, and to permit persons to whom the
     *  Software is furnished to do so, subject to the following
     *  conditions:
     *  
     *  The above copyright notice and this permission notice shall be
     *  included in all copies or substantial portions of the Software.
     *  
     *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
     *  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
     *  OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
     *  NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
     *  HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
     *  WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
     *  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
     *  OTHER DEALINGS IN THE SOFTWARE.
*/
