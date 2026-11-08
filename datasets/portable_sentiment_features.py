"""Versioned, matching Python/ONNX text features for new supporting candidates.

ASCII-only case folding is intentional: ONNX's portable C locale is not Python's
Unicode lower(). Character ngrams preserve whitespace instead of Python-only
whitespace collapsing. The exporter also corrects sublinear TF and pruned-token
ngram handling. Vocabulary/IDF can be retained when adapting a COPY.
"""
import copy
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

ASCII_LOWER = str.maketrans('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')


def ascii_lower(text):
    return text.translate(ASCII_LOWER)


class PortableTfidfVectorizer(TfidfVectorizer):
    def build_preprocessor(self):
        if self.preprocessor is not None or self.strip_accents is not None:
            raise ValueError('Portable features require the standard ASCII preprocessing contract')
        return ascii_lower if self.lowercase else str

    def _char_ngrams(self, text_document):
        minimum, maximum = self.ngram_range
        return [text_document[start:start + n] for n in range(minimum, min(maximum, len(text_document)) + 1)
                for start in range(len(text_document) - n + 1)]


def register_converter():
    from skl2onnx import update_registered_converter
    from skl2onnx.common._registration import get_converter, get_shape_calculator
    from skl2onnx.common.data_types import FloatTensorType
    from skl2onnx.common._apply_operation import apply_normalizer
    from onnx import TensorProto

    original = get_converter('SklearnTfidfVectorizer')

    def convert(scope, operator, container):
        vectorizer = operator.raw_operator
        # ONNX's ngram trie needs the constituent unigram tokens even when
        # sklearn pruned their standalone features. Append internal-only columns,
        # then slice them away; fitted feature indices and IDF remain unchanged.
        counting = copy.deepcopy(vectorizer)
        columns = len(vectorizer.vocabulary_)
        if vectorizer.analyzer == 'word':
            for term in list(counting.vocabulary_):
                for token in term.split(' '):
                    if token not in counting.vocabulary_:
                        counting.vocabulary_[token] = len(counting.vocabulary_)
        tokenexp = r'[\p{L}\p{N}_]{2,}' if vectorizer.analyzer == 'word' else r'(?s:.)'
        container.add_options(id(counting), {'tokenexp': tokenexp, 'locale': 'C'})
        counter = scope.declare_local_operator('SklearnCountVectorizer', counting)
        counter.inputs = operator.inputs
        counted = scope.declare_local_variable('portable_counts', FloatTensorType([None, len(counting.vocabulary_)]))
        counter.outputs.append(counted)
        data = counted.full_name
        def constant(name, values, dtype=TensorProto.FLOAT):
            result = scope.get_unique_variable_name(name)
            container.add_initializer(result, dtype, [len(values)], values)
            return result
        def node(kind, inputs):
            output = scope.get_unique_variable_name('portable_' + kind.lower())
            container.add_node(kind, inputs, output, name=scope.get_unique_operator_name(kind))
            return output
        if len(counting.vocabulary_) != columns:
            data = node('Slice', [data, constant('starts', [0], TensorProto.INT64),
                constant('ends', [columns], TensorProto.INT64), constant('axes', [1], TensorProto.INT64)])
        if vectorizer.sublinear_tf:
            # sklearn uses 1+log(count) for nonzero entries. The installed
            # converter uses log(1+count), which changes repeated-token weights.
            one, zero = constant('one', [1.0]), constant('zero', [0.0])
            transformed = node('Add', [node('Log', [node('Max', [data, one])]), one])
            data = node('Where', [node('Greater', [data, zero]), transformed, zero])
        if vectorizer.use_idf:
            data = node('Mul', [data, constant('idf', vectorizer.idf_.astype(np.float32).tolist())])
        if vectorizer.norm:
            apply_normalizer(scope, data, operator.output_full_names[0], container,
                             norm=vectorizer.norm.upper(), use_float=True)
        else:
            container.add_node('Identity', data, operator.output_full_names[0])

    update_registered_converter(PortableTfidfVectorizer, 'CommuniShieldPortableTfidf',
        get_shape_calculator('SklearnTfidfVectorizer'), convert, options=original.get_allowed_options())


def adapt_pipeline(pipeline):
    """Change feature semantics only in a separately evaluated candidate copy."""
    result = copy.deepcopy(pipeline)
    for _, vectorizer in result.named_steps['features'].transformer_list:
        if not isinstance(vectorizer, TfidfVectorizer) or vectorizer.analyzer not in ('word', 'char'):
            raise ValueError('Unsupported feature type for portable export')
        vectorizer.__class__ = PortableTfidfVectorizer
    return result


def pin_padding(model):
    # The stock converter chooses '#' by checking complete vocabulary strings.
    # For character ngrams '#' may occur INSIDE a feature (e.g. '..#') without
    # being a standalone feature. Batch padding then invents suffix ngrams.
    # Use a multicharacter sentinel absent from every atomic ngram token.
    tokens = set()
    for node in model.graph.node:
        if node.op_type == 'TfIdfVectorizer':
            for attribute in node.attribute:
                if attribute.name == 'pool_strings':
                    tokens.update(attribute.strings)
    padding = b'__communishield_padding_v1__'
    while padding in tokens:
        padding += b'_'
    for node in model.graph.node:
        if node.op_type == 'Tokenizer':
            for attribute in node.attribute:
                if attribute.name == 'pad_value':
                    attribute.s = padding


def verify_export(pipeline, path, texts, tolerance=2e-5):
    """Fail closed on label OR probability drift before a candidate can ship."""
    import onnxruntime as ort
    options = ort.SessionOptions(); options.intra_op_num_threads = 2; options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(path), sess_options=options, providers=['CPUExecutionProvider'])
    mismatches, difference = 0, 0.0
    for start in range(0, len(texts), 32):
        batch = texts[start:start + 32]
        expected = pipeline.predict_proba(batch)
        actual = session.run(['probabilities'], {'text': np.array(batch, dtype=object).reshape(-1, 1)})[0]
        if actual.shape != expected.shape or not np.isfinite(actual).all():
            raise ValueError('Invalid ONNX probability contract')
        mismatches += int((expected.argmax(1) != actual.argmax(1)).sum())
        difference = max(difference, float(np.abs(expected - actual).max()))
    receipt = {'samples': len(texts), 'prediction_mismatches': mismatches,
               'maximum_probability_difference': difference, 'probability_tolerance': tolerance,
               'passed': mismatches == 0 and difference <= tolerance}
    if not receipt['passed']:
        raise ValueError(f'ONNX export parity failed: {mismatches} differing labels; maximum probability difference {difference:.6g}')
    return receipt


register_converter()
