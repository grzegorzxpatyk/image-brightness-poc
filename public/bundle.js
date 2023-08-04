var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    let src_url_equal_anchor;
    function src_url_equal(element_src, url) {
        if (!src_url_equal_anchor) {
            src_url_equal_anchor = document.createElement('a');
        }
        src_url_equal_anchor.href = url;
        return element_src === src_url_equal_anchor.href;
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? null : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        if (value == null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.59.2' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation, has_stop_immediate_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        if (has_stop_immediate_propagation)
            modifiers.push('stopImmediatePropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* App.svelte generated by Svelte v3.59.2 */

    const { console: console_1 } = globals;
    const file = "App.svelte";

    function create_fragment(ctx) {
    	let main;
    	let div1;
    	let div0;
    	let img;
    	let img_src_value;
    	let t0;
    	let h30;
    	let t1;
    	let t2_value = /*brightness*/ ctx[3].toFixed(1) + "";
    	let t2;
    	let t3;
    	let input0;
    	let t4;
    	let input1;
    	let t5;
    	let div3;
    	let div2;
    	let t6;
    	let h31;
    	let t7;
    	let t8_value = /*overlay*/ ctx[0].toFixed(1) + "";
    	let t8;
    	let t9;
    	let input2;
    	let t10;
    	let input3;
    	let t11;
    	let h32;
    	let t12;
    	let t13;
    	let t14;
    	let h33;
    	let t15;
    	let t16;
    	let t17;
    	let input4;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			main = element("main");
    			div1 = element("div");
    			div0 = element("div");
    			img = element("img");
    			t0 = space();
    			h30 = element("h3");
    			t1 = text("brightness: ");
    			t2 = text(t2_value);
    			t3 = space();
    			input0 = element("input");
    			t4 = space();
    			input1 = element("input");
    			t5 = space();
    			div3 = element("div");
    			div2 = element("div");
    			t6 = space();
    			h31 = element("h3");
    			t7 = text("color overlay: ");
    			t8 = text(t8_value);
    			t9 = space();
    			input2 = element("input");
    			t10 = space();
    			input3 = element("input");
    			t11 = space();
    			h32 = element("h3");
    			t12 = text("color: ");
    			t13 = text(/*color*/ ctx[1]);
    			t14 = space();
    			h33 = element("h3");
    			t15 = text("rgbaColor: ");
    			t16 = text(/*rgbaColor*/ ctx[2]);
    			t17 = space();
    			input4 = element("input");
    			if (!src_url_equal(img.src, img_src_value = "https://loremflickr.com/640/320/map,europe/all?lock=77\n")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "random");
    			add_location(img, file, 60, 2, 1256);
    			attr_dev(div0, "class", "container svelte-12x2r6a");
    			add_location(div0, file, 59, 2, 1230);
    			add_location(h30, file, 63, 2, 1346);
    			attr_dev(input0, "type", "range");
    			attr_dev(input0, "min", "0");
    			attr_dev(input0, "max", "10");
    			attr_dev(input0, "step", "0.1");
    			add_location(input0, file, 64, 1, 1392);
    			attr_dev(input1, "type", "number");
    			attr_dev(input1, "min", "0");
    			attr_dev(input1, "max", "10");
    			attr_dev(input1, "step", "0.1");
    			attr_dev(input1, "class", "svelte-12x2r6a");
    			add_location(input1, file, 65, 2, 1467);
    			attr_dev(div1, "class", "wraper svelte-12x2r6a");
    			add_location(div1, file, 58, 2, 1207);
    			attr_dev(div2, "class", "secondcontainer svelte-12x2r6a");
    			add_location(div2, file, 68, 2, 1575);
    			add_location(h31, file, 70, 2, 1616);
    			attr_dev(input2, "type", "range");
    			attr_dev(input2, "min", "0");
    			attr_dev(input2, "max", "1");
    			attr_dev(input2, "step", "0.1");
    			add_location(input2, file, 71, 1, 1662);
    			attr_dev(input3, "type", "number");
    			attr_dev(input3, "min", "0");
    			attr_dev(input3, "max", "1");
    			attr_dev(input3, "step", "0.1");
    			attr_dev(input3, "class", "svelte-12x2r6a");
    			add_location(input3, file, 72, 2, 1733);
    			add_location(h32, file, 73, 2, 1805);
    			add_location(h33, file, 74, 2, 1831);
    			attr_dev(input4, "type", "color");
    			add_location(input4, file, 75, 2, 1865);
    			attr_dev(div3, "class", "wraper svelte-12x2r6a");
    			add_location(div3, file, 67, 2, 1552);
    			set_style(main, "--img-brightness", /*brightness*/ ctx[3]);
    			set_style(main, "--rgbaColor", /*rgbaColor*/ ctx[2]);
    			attr_dev(main, "class", "svelte-12x2r6a");
    			add_location(main, file, 57, 0, 1133);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, div1);
    			append_dev(div1, div0);
    			append_dev(div0, img);
    			append_dev(div1, t0);
    			append_dev(div1, h30);
    			append_dev(h30, t1);
    			append_dev(h30, t2);
    			append_dev(div1, t3);
    			append_dev(div1, input0);
    			set_input_value(input0, /*brightness*/ ctx[3]);
    			append_dev(div1, t4);
    			append_dev(div1, input1);
    			set_input_value(input1, /*brightness*/ ctx[3]);
    			append_dev(main, t5);
    			append_dev(main, div3);
    			append_dev(div3, div2);
    			append_dev(div3, t6);
    			append_dev(div3, h31);
    			append_dev(h31, t7);
    			append_dev(h31, t8);
    			append_dev(div3, t9);
    			append_dev(div3, input2);
    			set_input_value(input2, /*overlay*/ ctx[0]);
    			append_dev(div3, t10);
    			append_dev(div3, input3);
    			set_input_value(input3, /*overlay*/ ctx[0]);
    			append_dev(div3, t11);
    			append_dev(div3, h32);
    			append_dev(h32, t12);
    			append_dev(h32, t13);
    			append_dev(div3, t14);
    			append_dev(div3, h33);
    			append_dev(h33, t15);
    			append_dev(h33, t16);
    			append_dev(div3, t17);
    			append_dev(div3, input4);
    			set_input_value(input4, /*color*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "change", /*input0_change_input_handler*/ ctx[8]),
    					listen_dev(input0, "input", /*input0_change_input_handler*/ ctx[8]),
    					listen_dev(input1, "input", /*input1_input_handler*/ ctx[9]),
    					listen_dev(input2, "change", /*input2_change_input_handler*/ ctx[10]),
    					listen_dev(input2, "input", /*input2_change_input_handler*/ ctx[10]),
    					listen_dev(input3, "input", /*input3_input_handler*/ ctx[11]),
    					listen_dev(input4, "input", /*input4_input_handler*/ ctx[12])
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*brightness*/ 8 && t2_value !== (t2_value = /*brightness*/ ctx[3].toFixed(1) + "")) set_data_dev(t2, t2_value);

    			if (dirty & /*brightness*/ 8) {
    				set_input_value(input0, /*brightness*/ ctx[3]);
    			}

    			if (dirty & /*brightness*/ 8 && to_number(input1.value) !== /*brightness*/ ctx[3]) {
    				set_input_value(input1, /*brightness*/ ctx[3]);
    			}

    			if (dirty & /*overlay*/ 1 && t8_value !== (t8_value = /*overlay*/ ctx[0].toFixed(1) + "")) set_data_dev(t8, t8_value);

    			if (dirty & /*overlay*/ 1) {
    				set_input_value(input2, /*overlay*/ ctx[0]);
    			}

    			if (dirty & /*overlay*/ 1 && to_number(input3.value) !== /*overlay*/ ctx[0]) {
    				set_input_value(input3, /*overlay*/ ctx[0]);
    			}

    			if (dirty & /*color*/ 2) set_data_dev(t13, /*color*/ ctx[1]);
    			if (dirty & /*rgbaColor*/ 4) set_data_dev(t16, /*rgbaColor*/ ctx[2]);

    			if (dirty & /*color*/ 2) {
    				set_input_value(input4, /*color*/ ctx[1]);
    			}

    			if (dirty & /*brightness*/ 8) {
    				set_style(main, "--img-brightness", /*brightness*/ ctx[3]);
    			}

    			if (dirty & /*rgbaColor*/ 4) {
    				set_style(main, "--rgbaColor", /*rgbaColor*/ ctx[2]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	let brightness = 1;
    	let overlay = 0;
    	let color = "#ffffff";
    	let r = 255;
    	let g = 255;
    	let b = 255;
    	let rgbColor = `${r}, ${g}, ${b}`;
    	let rgbaColor = `${rgbColor}, ${overlay}`;
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function input0_change_input_handler() {
    		brightness = to_number(this.value);
    		$$invalidate(3, brightness);
    	}

    	function input1_input_handler() {
    		brightness = to_number(this.value);
    		$$invalidate(3, brightness);
    	}

    	function input2_change_input_handler() {
    		overlay = to_number(this.value);
    		$$invalidate(0, overlay);
    	}

    	function input3_input_handler() {
    		overlay = to_number(this.value);
    		$$invalidate(0, overlay);
    	}

    	function input4_input_handler() {
    		color = this.value;
    		$$invalidate(1, color);
    	}

    	$$self.$capture_state = () => ({
    		brightness,
    		overlay,
    		color,
    		r,
    		g,
    		b,
    		rgbColor,
    		rgbaColor
    	});

    	$$self.$inject_state = $$props => {
    		if ('brightness' in $$props) $$invalidate(3, brightness = $$props.brightness);
    		if ('overlay' in $$props) $$invalidate(0, overlay = $$props.overlay);
    		if ('color' in $$props) $$invalidate(1, color = $$props.color);
    		if ('r' in $$props) $$invalidate(4, r = $$props.r);
    		if ('g' in $$props) $$invalidate(5, g = $$props.g);
    		if ('b' in $$props) $$invalidate(6, b = $$props.b);
    		if ('rgbColor' in $$props) $$invalidate(7, rgbColor = $$props.rgbColor);
    		if ('rgbaColor' in $$props) $$invalidate(2, rgbaColor = $$props.rgbaColor);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*color, r, g, b, rgbColor, overlay, rgbaColor*/ 247) {
    			 {
    				$$invalidate(4, r = parseInt(color.substr(1, 2), 16));
    				$$invalidate(5, g = parseInt(color.substr(3, 2), 16));
    				$$invalidate(6, b = parseInt(color.substr(5, 2), 16));
    				$$invalidate(7, rgbColor = `${r}, ${g}, ${b}`);
    				console.log(rgbColor);
    				$$invalidate(2, rgbaColor = `${rgbColor}, ${overlay}`);
    				console.log(rgbaColor);
    			}
    		}
    	};

    	return [
    		overlay,
    		color,
    		rgbaColor,
    		brightness,
    		r,
    		g,
    		b,
    		rgbColor,
    		input0_change_input_handler,
    		input1_input_handler,
    		input2_change_input_handler,
    		input3_input_handler,
    		input4_input_handler
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
      target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
